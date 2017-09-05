'use strict';

const express=require('express'),
      dateformat=require('dateformat');

class Api {

    constructor(session, configs) {
        this.session=session;
        this.update_intervals=configs.update_intervals;
        console.log(this.update_intervals);
        console.log(JSON.stringify(this.update_intervals));
        this.path=configs.request_path;
        this.app=express();
        this.initInterfaces(configs.domain, configs.port);
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
            res.send(JSON.stringify(playersResponse));
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
        if (eventObject.inPlayers !== null && eventObject.inPlayers.length > 0) {
            eventObject.inPlayers=eventObject.inPlayers.map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        if (eventObject.outPlayers !== null && eventObject.outPlayers.length > 0) {
            eventObject.outPlayers=eventObject.outPlayers.map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        if (eventObject.nonAnsweredPlayers !== null && eventObject.nonAnsweredPlayers.length > 0) {
            eventObject.nonAnsweredPlayers=eventObject.nonAnsweredPlayers.map(pl => {
                let playerObject=ref.session.players.getPlayer(pl);
                if (playerObject === null) {
                    return pl;
                }
                return playerObject.get_object();
            });
        }
        return eventObject;
    };

    getOldestRequestTime(events) {
        events.sort(function(a, b) {
            let aTime=new Date(a.request_date).getTime();
            let bTime=new Date(b.request_date).getTime();
            return aTime - bTime;
        });
        return events[0].request_date;
    }

    initInterfaces(domain, port) {
        let ref=this;
        this.app.get(ref.path+'players', function(req, res) {
            if (ref.shouldUpdate('players', ref.session.players.request_date)) {
                console.log('Too old data, fetching players again');
                ref.updateAndReturnPlayers(res);
            } else {
                let playersResponse=ref.session.players.players.map(pl => pl.get_object());
                res.send(JSON.stringify(playersResponse));
            }
        });
        this.app.get(ref.path+'players/:id', function(req, res) {
            let playerId=req.params.id;
            let playerObject=ref.getPlayerObject(playerId);
            if (ref.shouldUpdate('players', ref.session.players.request_date)) {
                console.log('Too old data, fetching players again');
                ref.updateAndReturnPlayer(res, playerObject);
            } else {
                res.send(JSON.stringify(playerObject));
            }
        });
        this.app.get(ref.path+'events', function(req, res) {
            let oldest=ref.getOldestRequestTime(ref.session.events);
            if (ref.shouldUpdate('events', oldest)) {
                console.log('Too old data, fetching events again');
                ref.updateAndReturnEvents(res);
            } else {
                let eventsResponse=ref.handleEventsResponse(ref.session.events);
                res.send(JSON.stringify(eventsResponse));
            }
        });
        this.app.get(ref.path+'events/:id', function(req, res) {
            let eventId=req.params.id;
            let eventObject=ref.getEventObject(eventId);
            if (ref.shouldUpdate('event', eventObject.request_date)) {
                console.log('Too old data, fetching event '+eventObject.id+' again');
                ref.updateAndReturnEvent(res, eventObject);
            } else {
                eventObject=ref.fillEventDetails(eventObject);
                res.send(JSON.stringify(eventObject));
            }
        });
        this.app.listen(port, domain);
    }

};

module.exports=Api;

