const config=require('config'),
      jsdom=require('jsdom'),
      q=require('q'),
      express=require('express'),
      dateformat=require('dateformat'),
      // custom classes
      Session=require('./classes/session.class.js'),
      Players=require('./classes/players.class.js'),
      Event=require('./classes/event.class.js');

// Constants from configurations
const username=config.get('credentials.username'),
      password=config.get('credentials.password'),
      sub=config.get('team.abbreviation'),
      domain='https://'+sub+'.nimenhuuto.com/',
      update_interval=config.get('api.event_update_interval');

// Globally used variables
var session=new Session(domain);

// The whole thing's run by initializing session and starting the handle
let session_callback=function(error, response, body) {
    if (response.statusCode !== 200 && 
            response.statusCode !== 302 &&
            response.statusCode !== 301) {
        session.initialized=false;
        console.error('Error opening session ('+response.statusCode+')');
        console.error(error);
        return;
    }
    session.init_players_cache().then(function(playersCache) {
        if (playersCache === null || playersCache.players.length === 0) {
            session.initialized=false;
            console.error('Error initializing players cache. Nothing found.');
            return;
        }
        console.log(playersCache.players.length+' players initialized to cache');
        session.fetch_events().then(function(events) {
            console.log('Fetched all '+events.length+' events');
            // Sort events by time
            session.events.sort(function(a, b) {
                return a.date.getTime() - b.date.getTime();
            });
            session.initialized=true;
            session.events.forEach(function(nhEvent) {
                console.log(nhEvent.get_event_info());
                let inPlayers=[];
                nhEvent.inPlayers.forEach(playerDom => {
                    let playerInfo=session.players.getPlayer(playerDom.id);
                    inPlayers.push(playerInfo.get_player_info_string());
                });
                console.log('In ('+inPlayers.length+'): '+inPlayers.join(', '));
                let outPlayers=[];
                nhEvent.outPlayers.forEach(playerDom => {
                    let playerInfo=session.players.getPlayer(playerDom.id);
                    outPlayers.push(playerInfo.get_player_info_string());
                });
                console.log('Out ('+outPlayers.length+'): '+outPlayers.join(', '));
                let nonAnsweredPlayers=[];
                nhEvent.nonAnsweredPlayers.forEach(playerDom => {
                    let playerInfo=session.players.getPlayer(playerDom.id);
                    nonAnsweredPlayers.push(playerInfo.get_player_info_string());
                });
                console.log('? ('+nonAnsweredPlayers.length+'): '+nonAnsweredPlayers.join(', '));
            });
        }, function(events_error) {
            console.error('Error fetching events!');
            console.error(events_error);
        });
    }, function(players_error) {
        session.initialized=false;
        console.error('Error initializing players cache');
        console.error(players_error);
    });
};

// Aka. init
session.login(username, password, session_callback);

const app=express();
app.get('/spede-events/players', function(req, res) {
    let playersResponse=session.players.players.map(pl => pl.get_object());
    res.send(JSON.stringify(playersResponse));
});
app.get('/spede-events/players/:id', function(req, res) {
    let playerId=req.params.id;
    let playerResponse=session.players.getPlayer(playerId);
    if (playerResponse === null) {
        res.send(JSON.stringify(playerResponse));
    } else {
        playerResponse=playerResponse.get_object();
        res.send(JSON.stringify(playerResponse));
    }
});
app.get('/spede-events/events', function(req, res) {
    let oldest=session.events.map(ev => ev.get_object().request_date).min();
    let oldestDate=new Date(oldest);
    let now=new Date();
    let nowDate=new Date(dateformat(now, 'yyyy-mm-dd')+'T'+dateformat(now, 'HH:MM:ss'));
    if ((nowDate.getTime() - oldestDate.getTime()) > update_interval) {
        console.log('Too old data, fetching events again');
        session.fetch_events().then(function(events) {
            console.log(events.length+' events fetched');
            // Sort events by time
            session.events.sort(function(a, b) {
                return a.date.getTime() - b.date.getTime();
            });
            let eventsResponse=session.events.map(ev => ev.get_object());
            res.send(JSON.stringify(eventsResponse));
        }, function(error) {
            console.warn('Unable to fetch events');
            console.warn(error);
            console.log('Attempting relogin');
            session.login(username, password, session_callback);
        });
    } else {
        let eventsResponse=session.events.map(ev => ev.get_object());
        res.send(JSON.stringify(eventsResponse));
    }
});
app.get('/spede-events/events/:id', function(req, res) {
    let eventId=req.params.id;
    let eventResponse=session.events.filter(ev => ev.id === eventId);
    if (eventResponse.length === 0) {
        eventResponse=session.events.filter(ev => {
            let eventDate=dateformat(ev.date, 'yyyy-mm-dd')+'T'+dateformat(ev.date, 'HH:MM');
            return eventDate === eventId;
        });
    }
    if (eventResponse.length === 0) {
        res.send(JSON.stringify(null));
    } else {
        let fillEventDetails=function(eventObject) {
            if (eventObject.inPlayers !== null && eventObject.inPlayers.length > 0) {
                eventObject.inPlayers=eventObject.inPlayers.map(pl => {
                    let playerObject=session.players.getPlayer(pl);
                    if (playerObject === null) {
                        return pl;
                    }
                    return playerObject.get_object();
                });
            }
            if (eventObject.outPlayers !== null && eventObject.outPlayers.length > 0) {
                eventObject.outPlayers=eventObject.outPlayers.map(pl => {
                    let playerObject=session.players.getPlayer(pl);
                    if (playerObject === null) {
                        return pl;
                    }
                    return playerObject.get_object();
                });
            }
            if (eventObject.nonAnsweredPlayers !== null && eventObject.nonAnsweredPlayers.length > 0) {
                eventObject.nonAnsweredPlayers=eventObject.nonAnsweredPlayers.map(pl => {
                    let playerObject=session.players.getPlayer(pl);
                    if (playerObject === null) {
                        return pl;
                    }
                    return playerObject.get_object();
                });
            }
            return eventObject;
        };
        let eventObject=eventResponse[0].get_object();
        let lastRequestDate=new Date(eventObject.request_date);
        let now=new Date();
        let nowDate=new Date(dateformat(now, 'yyyy-mm-dd')+'T'+dateformat(now, 'HH:MM:ss'));
        if ((nowDate.getTime() - lastRequestDate.getTime()) > update_interval) {
            console.log('Too old data, fetching events again');
            session.fetch_events().then(function(events) {
                console.log(events.length+' events fetched');
                // Sort events by time
                session.events.sort(function(a, b) {
                    return a.date.getTime() - b.date.getTime();
                });
                eventResponse=session.events.filter(ev => ev.id === eventId);
                if (eventResponse.length === 0) {
                    eventResponse=session.events.filter(ev => {
                        let eventDate=dateformat(ev.date, 'yyyy-mm-dd')+'T'+dateformat(ev.date, 'HH:MM');
                        return eventDate === eventId;
                    });
                }
                eventObject=eventResponse[0].get_object();
                eventObject=fillEventDetails(eventObject);
                res.send(JSON.stringify(eventObject));
            }, function(error) {
                console.warn('Unable to fetch events');
                console.warn(error);
                console.log('Attempting relogin');
                session.login(username, password, session_callback);
            });
        } else {
            eventObject=fillEventDetails(eventObject);
            res.send(JSON.stringify(eventObject));
        }
    }
});
app.listen(8080, '192.168.0.20');

