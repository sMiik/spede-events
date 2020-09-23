'use strict';

const express=require('express'),
      dateformat=require('dateformat'),
      q=require('q'),
      fs=require('fs'),
      path=require('path');

class Api {

    constructor(session, configs) {
        this.resetApi(session, configs);
    }

    resetApi(session, configs) {
        this.session=session;
        this.update_intervals=configs.update_intervals;
        this.path=configs.request_path;
        this.app=express();
        this.configureApp();
        this.initInterfaces(configs.domain, configs.port);
    }

    configureApp() {
        this.app.set('x-powered-by', false);
        this.app.set('etag', false);
        this.app.set('lastModified', false);
        this.app.use(function(req, res, next) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Content-Type', 'application/json');
            next();
        });
    }

    getPlayerObject(playerId) {
        let playerResponse=this.session.players.getPlayer(playerId);
        if (playerResponse === null) {
            return null;
        }
        return playerResponse.get_object();
    }

    getEventObject(eventId) {
        let eventResponse=this.session.events.filter(ev => ev.id === eventId);
        if (eventResponse.length === 0) {
            eventResponse=this.session.events.filter(ev => {
                let eventDate=dateformat(ev.date, 'yyyy-mm-dd')+'T'+dateformat(ev.date, 'HH:MM:ss');
                // With or without seconds
                return eventDate === eventId ||
                        eventDate.substring(0, eventDate.length-3) === eventId;
            });
            if (eventResponse.length === 0) {
                return null;
            }
        }
        return eventResponse[0].get_object();
    }

    handleEventsResponse(events) {
        return events.map(ev => ev.get_object());
    }

    shouldUpdate(type, request_date) {
        if (!this.update_intervals.hasOwnProperty(type)) {
            // No interval, no updates
            console.warn('No update interval for '+type+' specified');
            return false;
        }
        let now=new Date();
        let nowString=dateformat(now, 'yyyy-mm-dd')+'T'+dateformat(now, 'HH:MM:ss');
        let nowTime=new Date(nowString).getTime();
        let requestTime=new Date(request_date).getTime();
        return ((nowTime - requestTime) > this.update_intervals[type]);
    }

    updateAndReturnPlayers(res) {
        let ref=this;
        this.session.init_players_cache().then(function(playersCache) {
            if (playersCache === null || playersCache.players.length === 0) {
                console.error('Error initializing players cache. Nothing found.');
                return;
            }
            console.log(playersCache.players.length+' players initialized to cache');
            let playersResponse=ref.session.players.players.map(pl => pl.get_object());
            ref.createCache('players', playersResponse);
            res.send(JSON.stringify(playersResponse));
        }, function(error) {
            console.warn('Unable to fetch players');
            console.warn(error);
            console.log('Attempting to relogin');
            ref.session.relogin();
        });
    }
    
    updateAndReturnPlayer(res, playerObj) {
        let ref=this;
        this.session.init_players_cache().then(function(playersCache) {
            if (playersCache === null || playersCache.players.length === 0) {
                console.error('Error initializing players cache. Nothing found.');
                return;
            }
            console.log(playersCache.players.length+' players initialized to cache');
            let playerResponse=ref.getPlayerObject(playerObj.id);
            ref.createCache('players/'+playerObj.id, playerResponse);
            res.send(JSON.stringify(playerResponse));
        }, function(error) {
            console.warn('Unable to fetch players');
            console.warn(error);
            console.log('Attempting to relogin');
            ref.session.relogin();
        });
    }

    updateAndReturnEvents(res) {
        let ref=this;
        this.session.fetch_events().then(function(events) {
            console.log(events.length+' events fetched');
            ref.session.events.sort(function(a, b) {
                return a.date.getTime() - b.date.getTime();
            });
            let response=ref.handleEventsResponse(ref.session.events);
            ref.createCache('events', response);
            res.send(JSON.stringify(response));
        }, function(error) {
            console.warn('Unable to fetch events');
            console.warn(error);
            console.log('Attempting relogin');
            ref.session.relogin();
        });
    }

    updateAndReturnEvent(res, eventObject) {
        let ref=this;
        let event_idx=this.session.events.indexOf(ev => ev.id === eventObject.id);
        this.session.request_event(eventObject.link).then(function(eventResponse) {
            ref.session.events[event_idx]=eventResponse;
            console.log(eventResponse.request_date+': event '+eventResponse.id+' updated');
            eventObject=eventResponse.get_object();
            eventObject=ref.fillEventDetails(eventObject);
            this.createCache('events/'+eventObject.id, eventObject);
            res.send(JSON.stringify(eventObject));
        }, function(error) {
            console.warn('Unable to fetch event '+eventObject.id);
            console.warn(error);
            console.log('Attempting relogin');
            ref.session.relogin();
        });
    }

    fillEventDetails(eventObject) {
        let ref=this;
        if (!!eventObject.players && !!eventObject.players['in']) {
            eventObject.players['in']=eventObject.players['in'].map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        if (!!eventObject.players && !!eventObject.players['out']) {
            eventObject.players['out']=eventObject.players['out'].map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        if (!!eventObject.players && !!eventObject.players['?']) {
            eventObject.players['?']=eventObject.players['?'].map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        return eventObject;
    }

    getOldestRequestTime(events) {
        events.sort(function(a, b) {
            if (a.archiveEvent) return 1;
            let aTime=new Date(a.request_date).getTime();
            let bTime=new Date(b.request_date).getTime();
            return aTime - bTime;
        });
        return events[0].request_date;
    }

    isInvalidSession() {
        try {
            let returnValue=typeof(this.session.players) === 'undefined' ||
                    this.session.players === null ||
                    this.session.players.length === 0 ||
                    typeof(this.session.events) !== typeof([]) ||
                    this.session.events === null ||
                    (this.session.events.length > 0 &&
                    this.session.events.filter(ev => ev.id === null).length > 0);
            if (returnValue) {
                console.error('Session broken! attempting to renew..');
            }
            return returnValue;
        } catch(e) {
            console.error('Failure with session\nHeaders:\n');
            for (let h in this.session.headers) {
                console.error(h+': '+this.session_headers[h]);
            }
            console.error('Request count: '+this.session.request_count+'\n');
        }
    }

    handlePlayersApiResponse(res) {
        let ref=this;
        ref.useCache('players', res, function(){
            if (ref.shouldUpdate('players', ref.session.players.request_date)) {
                console.log('Too old data, fetching players again');
                ref.updateAndReturnPlayers(res);
            } else {
                let playersResponse=ref.session.players.players.map(pl => pl.get_object());
                ref.createCache('players', playersResponse);
                res.send(JSON.stringify(playersResponse));
            }
        });
    }

    handlePlayerApiResponse(res, params) {
        let playerId=params.id;
        let playerObject=this.getPlayerObject(playerId);
        let ref=this;
        ref.useCache('players/'+playerId, res, function(){
            if (ref.shouldUpdate('players', ref.session.players.request_date)) {
                console.log('Too old data, fetching players again');
                ref.updateAndReturnPlayer(res, playerObject);
            } else {
                ref.createCache('players/'+playerId, playerObject);
                res.send(JSON.stringify(playerObject));
            }
        });
    }

    handleEventsApiResponse(res) {
        let ref=this;
        ref.useCache('events', res, function(){
            if (ref.session.events.length > 0) {
                let oldest=ref.getOldestRequestTime(ref.session.events);
                if (ref.shouldUpdate('events', oldest)) {
                    console.log('Too old data, fetching events again');
                    ref.updateAndReturnEvents(res);
                } else {
                    let eventsResponse=ref.handleEventsResponse(ref.session.events);
                    ref.createCache('events', eventsResponse);
                    res.send(JSON.stringify(eventsResponse));
                }
            } else {
                res.send(JSON.stringify(ref.session.events));
            }
        });
    }

    handleEventApiResponse(res, params) {
        let eventId=params.id;
        let eventObject=this.getEventObject(eventId);
        let ref=this;
        ref.useCache('events/'+eventId, res, function(){
			if (eventObject == null || ref.shouldUpdate('event', eventObject.request_date)) {
                console.log('Too old data, fetching event '+eventObject.id+' again');
                ref.updateAndReturnEvent(res, eventObject);
            } else {
                eventObject=ref.fillEventDetails(eventObject);
                ref.createCache('events/'+eventId, eventObject);
                res.send(JSON.stringify(eventObject));
            }
        });
    }

    createCache(dirpath, data) {
        const cachePath=this.dataCachePath(dirpath);
        const dir=path.dirname(cachePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir);
        fs.writeFileSync(cachePath, JSON.stringify(data));
    }

    useCache(dirpath, res, cback) {
        const cachePath=this.dataCachePath(dirpath);
        if (!fs.existsSync(cachePath)) {
            console.log('no cache file found, saving response to ' + cachePath);
            cback();
            return;
        }
        const stats=fs.statSync(cachePath);
        let cacheType=null;
        if (dirpath.indexOf('players') >= 0) {
            cacheType='players';
        } else if (dirpath.indexOf('events') >= 0 && dirpath.indexOf('/') >= 0) {
            cacheType='event';
        } else if (dirpath.indexOf('events') >= 0) {
            cacheType='events';
        } else {
            console.warn('No data type found for '+dirpath+', must refresh');
        }
        const cacheDate=dateformat(stats.mtime, 'yyyy-mm-dd')+'T'+dateformat(stats.mtime, 'HH:MM:ss');
        if (cacheType == null) {
            cback();
        } else if (this.shouldUpdate(cacheType, cacheDate)) {
            console.log('Should update, so lets do it');
            cback();
        } else {
            console.log('Using cache \o/');
            const output=fs.readFileSync(cachePath);
            res.send(output);
        }
    }

    dataCachePath(path) {
        return 'data/'+path.replace('/', '_').replace('?','').replace('#','')+'-cache.json';
    }

    initInterfaces(domain, port) {
        let ref=this;
        this.app.get(ref.path+'players', function(req, res) {
            if (ref.isInvalidSession()) {
                ref.session.relogin().then(function() {
                    ref.handlePlayersApiResponse(res);
                }, function(error) {
                    res.send(JSON.stringify({'status':'error','description':error}));
                });
            } else {
                ref.handlePlayersApiResponse(res);
            }
        });
        this.app.get(ref.path+'players/:id', function(req, res) {
            if (ref.isInvalidSession()) {
                ref.session.relogin().then(function() {
                    ref.handlePlayerApiResponse(res, req.params);
                }, function(error) {
                    res.send(JSON.stringify({'status':'error','description':error}));
                });
            } else {
                ref.handlePlayerApiResponse(res, req.params);
            }
        });
        this.app.get(ref.path+'events', function(req, res) {
            if (ref.isInvalidSession()) {
                ref.session.relogin().then(function() {
                    ref.handleEventsApiResponse(res);
                }, function(error) {
                    res.send(JSON.stringify({'status':'error','description':error}));
                });
            } else {
                ref.handleEventsApiResponse(res);
            } 
        });
        this.app.get(ref.path+'events/:id', function(req, res) {
            if (ref.isInvalidSession()) {
                ref.session.relogin().then(function() {
                    ref.handleEventApiResponse(res, req.params);
                }, function(error) {
                    res.send(JSON.stringify({'status':'error','description':error}));
                });
            } else {
                ref.handleEventApiResponse(res, req.params);
            }
        });
        this.app.listen(port, domain);
    }

};

module.exports=Api;

