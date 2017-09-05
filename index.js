const config=require('config'),
      // custom classes
      Session=require('./classes/session.class.js'),
      Players=require('./classes/players.class.js'),
      Event=require('./classes/event.class.js'),
      Api=require('./classes/api.class.js');

// Constants from configurations
const username=config.get('credentials.username'),
      password=config.get('credentials.password'),
      sub=config.get('team.abbreviation'),
      domain='https://'+sub+'.nimenhuuto.com/',
      api_config=config.get('api');

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

const api=new Api(session, api_config);

