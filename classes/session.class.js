'use strict';

const request=require('request'),
      q=require('q'),
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
    }

    fetch_headers(headers) {
        console.log('Fetching headers for further requests');
        let request_headers={};
        for (let i in headers) {
            if (accepted_headers.indexOf(i.toLowerCase()) === -1) {
                continue;
            }
            if (i.toLowerCase() === 'set-cookie') {
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

    do_request(url, method, data, callback) {
        let ref=this;
        request({url: url, method: method, headers: ref.headers, form: data, callback: callback});
    }

    get_request(url, callback) {
        this.do_request(url, 'GET', null, callback);
    }

    post_request(url, data, callback) {
        this.do_request(url, 'POST', data, callback);
    }

    login(username, password, callback) {
        let ref=this;
        return this.get_request(this.domain+'sessions/new', function(error, response, body) {
            if (response.statusCode !== 200) {
                console.error('Error fetching login form ('+response.statusCode+')');
                console.error(error);
                return;
            }
            ref.headers=ref.fetch_headers(response.headers);
            let loginDom=new Nimenhuuto(body);
            let authToken=loginDom.domObject.querySelector("input[type='hidden'][name='authenticity_token']").value;
            let loginForm={
                authenticity_token: authToken,
                login_redirect_url: '', 
                login_name: username,
                password: password,
                commit: 'Kirjaudu',
            };
            // Login
            ref.post_request(ref.domain+'sessions', loginForm, callback);
        });
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
            ref.players=new Players(body);
            ref.players.parsePlayers();
            defer.resolve(ref.players);
        });
        return defer.promise;
    }

    fetch_events() {
        console.log('Getting all the events (from first page)');
        let defer=q.defer();
        let event_promises=[];
        this.events=[];
        let ref=this;
        this.get_request(ref.domain+'events', function(events_error, events_response, events_body) {
            if (events_response.statusCode !== 200) {
                ref.initialized=false;
                defer.reject('Unable to fetch events ('+events_response+')\n'+error);
            }
            let eventsObject=new Nimenhuuto(events_body);
            let events=eventsObject.domObject.querySelectorAll('.event-detailed-container');
            console.log(events.length+' events found');
            // Chain requests to run in order
            let event_chain=q.when();
            for (let e=0; e<events.length; e++) {
                let event_link=events[e].querySelector('.event-title-link').href;
                event_promises.push(ref.request_event(event_link).then(function(nhEvent) {
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
            });
        });
        return defer.promise;
    }

    request_event(event_link) {
        let defer=q.defer();
        this.get_request(event_link, function(error, response, body) {
            if (response.statusCode !== 200) {
                defer.reject('Error fetching event from '+event_link+'\n'
                        +error);
            } else {
                let nhEvent=new Event(body);
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

};

module.exports=Session;

