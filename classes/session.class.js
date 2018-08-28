'use strict';

const request=require('request'),
      q=require('q'),
      dateformat=require('dateformat'),
      delay=require('delay'),
      // custom classes
      Nimenhuuto=require('./nimenhuuto.class.js'),
      Players=require('./players.class.js'),
      Event=require('./event.class.js');

const accepted_headers=[
    'accept',
    'accept-encoding',
    'accept-language',
    'connection',
    'host',
    'referer',
    'set-cookie',
    'upgrade-insecure-requests',
    'user-agent'
];

class Session {

    constructor(domain) {
        console.log('Opening session for handling everything');
        this.domain=domain;
        this.initialized=false;
        this.headers={};
        this.players=null;
        this.events=[];
        this.keep_alive=null;
        this.request_count=0;
        this.expireTimeout={time: -1, timeout: null};
    }

    fetch_headers(headers) {
        console.log('Fetching headers for further requests');
        let request_headers={};
        for (let i in headers) {
            if (accepted_headers.indexOf(i.toLowerCase()) === -1) {
                continue;
            }
            if (i.toLowerCase() === 'set-cookie') {
                this.fetch_expire(headers[i]);
                request_headers['Cookie']=headers[i];
            } else if (i.toLowerCase() === 'connection') {
                request_headers[i]='keep-alive';
            } else {
                request_headers[i]=headers[i];
            }
        }   
        // Flatten and regenerate request headers (shouldn't be done but once)
        let requestHeaders={};
        for (let i in request_headers) {
            requestHeaders[i]= Array.isArray(request_headers[i]) ? request_headers[i].join('; ') : request_headers[i];
        }
        return requestHeaders;
    }

    fetch_expire(header) {
        const ref=this;
        if (Array.isArray(header)) {
            header.forEach(h => ref.fetch_expire(h));
        } else {
            const expireDateString=header.replace(/^(.*)expires=(.*);(.*)$/gi, '$2');
            if (expireDateString.length !== 0 && expireDateString !== header) {
                const expireDate=new Date(expireDateString);
                console.log('Timeout set to '+expireDate.toString());
                if (this.expireTimeout.timeout !== null) {
                    this.expireTimeout.timeout.cancel()
                }
                this.expireTimeout.time=expireDate.getTime();
                // 10 seconds before expire
                this.expireTimeout.time=(this.expireTimeout.time-new Date().getTime()-10000);
                this.expireTimeout.timeout=delay(this.expireTimeout.time);
                this.set_timeout();
            }
        }
    }

    async set_timeout() {
        if (this.expireTimeout.timeout === null) {
            console.warn('No timeout, nothing to do');
            return;
        }
        const ref=this;
        try {
            console.log('Timeout to expire in '+ref.expireTimeout.time);
            await ref.expireTimeout.timeout;
            ref.relogin();
        } catch(err) {
            console.error('Error with timeout');
            console.error(err);
        }
    }

    do_request(url, method, data, callback) {
        const ref=this;
        this.request_count++;
        request({url: url, method: method, headers: ref.headers, form: data, callback: callback});
    }

    get_request(url, callback) {
        this.do_request(url, 'GET', null, callback);
    }

    post_request(url, data, callback) {
        this.do_request(url, 'POST', data, callback);
    }

    login(username, password, callback) {
        this.username=username;
        this.password=password;
        this.callback=callback;
        this.relogin();
    }

    relogin() {
        console.log('Triggering relogin @ '+new Date().toString());
        let ref=this;
        let defer=q.defer();
        this.get_request(this.domain+'sessions/new', function(error, response, body) {
            if (error) {
                console.error('Error gotten!');
                console.error(error);
                defer.reject(error);
                return defer.response;
            }
            if (!response.statusCode) {
                console.error('Something weird happening, no statusCode');
                console.error(response);
                console.error(error);
                console.error(body);
                defer.reject('No statuscode gotten');
                return defer.promise;
            }
            if (response.statusCode !== 200) {
                console.error('Error fetching login form ('+response.statusCode+')');
                console.error(error);
                defer.reject('Error fetching login form ('+response.statusCode+')\n'+error);
                return defer.promise;
            }
            ref.headers=ref.fetch_headers(response.headers);
            console.log('Fetched headers');
            for (let h in ref.headers) {
                console.log(h+': '+ref.headers[h]);
            }   
            let loginDom=new Nimenhuuto(body);
            if (loginDom.domObject.querySelector("input[type='hidden'][name='authenticity_token']") === null) {
                defer.reject('WTF, no auth token found...');
                return defer.promise;
            }
            let authToken=loginDom.domObject.querySelector("input[type='hidden'][name='authenticity_token']").value;
            let loginForm={
                authenticity_token: authToken,
                login_redirect_url: '', 
                login_name: ref.username,
                password: ref.password,
                commit: 'Kirjaudu',
            };
            // Login
            ref.post_request(ref.domain+'sessions', loginForm, function(login_error, login_response, login_body) {
                ref.callback(login_error, login_response, login_body).then(function(session_response) {
                    defer.resolve(session_response);
                }, function(session_error) {
                    defer.reject(session_error);
                });
            });
        });
        return defer.promise;
    }

    init_players_cache() {
        console.log('Initializing players to cache');
        let defer=q.defer();
        let ref=this;
        this.get_request(ref.domain+'players', function(error, response, body) {
            if (response.statusCode !== 200) {
                console.error('Error fetching player data ('+response.statusCode+')');
                console.error(error);
                defer.reject('Error fetching player data ('+response.statusCode+')\n'+error);
            }
            let now=new Date();
            ref.players=new Players(body);
            ref.players.request_date=dateformat(now, 'yyyy-mm-dd')+'T'+dateformat(now, 'HH:MM:ss');
            ref.players.parsePlayers();
            defer.resolve(ref.players);
        });
        return defer.promise;
    }

    fetch_events(archive=false,page=1) {
        console.log('Getting all the '+(archive?'archived events':'events')+' (from page '+page+')');
        let defer=q.defer();
        let event_promises=[];
        let ref=this;
        this.get_request(ref.domain+(archive?'events/archive':'events')+'?page='+page, function(events_error, events_response, events_body) {
            if (events_response.statusCode !== 200) {
                ref.initialized=false;
                defer.reject('Unable to fetch events ('+events_response+')\n'+error);
            }
            let eventsObject=new Nimenhuuto(events_body);
            let events=eventsObject.domObject.querySelectorAll('.event-detailed-container');
            let counts=ref.get_event_counts();
            console.log(events.length+(archive?' archived events ':' events ')
                    +'found from page '+page
                    +' ('+counts.active+' active and '+counts.archived+' archived already fetched)');
            // Chain requests to run in order
            let event_chain=q.when();
            for (let e=0; e<events.length; e++) {
                let event_link=events[e].querySelector('.event-title-link').href;
                event_promises.push(ref.request_event(event_link,archive).then(function(nhEvent) {
                    if (ref.get_event(nhEvent.id) === null) {
                        ref.events.push(nhEvent);
                    } else {
                        ref.events=ref.events.reduce(function(prev, curr) {
                            return curr.id === nhEvent.id ? nhEvent : prev;
                        });
                    }
                }, function(error) {
                    console.error('Event request error with event '+event_link);
                    console.error(error);
                }));
            }
            // Wait for all events
            q.all(event_promises).then(function(all_events) {
                defer.resolve(all_events);
                let nextPage=eventsObject.domObject.querySelector('.next.next_page');
                let nextPageDisabled=eventsObject.domObject.querySelector('.next.next_page.disabled');
                if (nextPage!=null&&nextPageDisabled==null){
                    ref.fetch_events(archive,page+1);
                } else {
                    console.log('Reached the end of last page for '+(archive?'archived':'active')+' events (page '+page+')');
                }
            });
        });
        return defer.promise;
    }

    request_event(event_link, archived) {
        let defer=q.defer();
        this.get_request(event_link, function(error, response, body) {
            if (response.statusCode !== 200) {
                defer.reject('Error fetching event from '+event_link+'\n'
                        +error);
            } else {
                let nhEvent=new Event(body, archived);
                let now=new Date();
                nhEvent.request_date=dateformat(now, 'yyyy-mm-dd')+'T'+dateformat(now, 'HH:MM:ss');
                defer.resolve(nhEvent);
            }
        });
        return defer.promise;
    };

    get_event(event_id) {
        let nhEvent=this.events.filter(ev => ev.id === event_id);
        if (nhEvent.length === 0) {
            return null;
        }
        return nhEvent[0];
    }

    get_event_counts() {
        let counts={active:0,archived:0};
        for (let i=0;i<this.events.length;i++){
            if (this.events[i].archiveEvent) {
                counts.archived++;
            } else {
                counts.active++;
            }
        }
        return counts;
    }

};

module.exports=Session;

