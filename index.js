const config=require('config'),
      jsdom=require('jsdom'),
      q=require('q'),
      dateformat=require('dateformat');

const Session=require('./classes/session.class.js'),
      Players=require('./classes/players.class.js'),
      Event=require('./classes/event.class.js');

// Constants from configurations
const username=config.get('credentials.username'),
      password=config.get('credentials.password'),
      abbr=config.get('team.abbreviation'),
      domain='https://'+abbr+'.nimenhuuto.com/';

// Globally used variables
var playersCache=new Players();
var session=new Session();

function fetch_events() {
    console.log('Getting all the events (from first page)');
    session.do_request(domain+'events', 'GET', null, function(error, response, body) {
        if (response.statusCode !== 200) {
            console.error('Error fetching events ('+response.statusCode+')');
            console.error(error);
            return;
        }
        let domResponse=new jsdom.JSDOM(body).window.document;
        let events=domResponse.querySelectorAll('.event-detailed-container');
        console.log(events.length+' events found');
        // Chain requests to run in order
        let event_chain=q.when();
        for (let e=0; e<events.length; e++) {
            event_chain=event_chain.then(function() {
                // Return promise when ready, to get to the next one in line
                // Yeah, they are sorted by the UI here, wadap..
                return get_event_info(events[e]).then(function(success) {
                    console.log(success);
                    return success;
                }, function(error) {
                    console.error(error);
                    return error;
                });
            });
        }
    });
}

function get_player_name(player) {
    let playerName=player.textContent.trim();
    for (let attr=0; attr<player.attributes.length; attr++) {
        if (player.attributes[attr].name === 'title' && 
                player.attributes[attr].value.match(/Pelaaja<\/span> /)) {
            let playerTitleAttribute=player.attributes[attr].value;
            playerName=playerTitleAttribute.replace(/^(.*?)Pelaaja<\/span> (.*)$/, '$2');
        }
    }
    return playerName;
}

function get_player_info_string(playerDom) {
    let player=playersCache.getPlayer(playerDom.id);
    if (player === null) {
        return get_player_name(playerDom);
    } else {
        let player_info_array=[];
        if (player.jersey !== '?') {
            player_info_array.push(player.jersey);
        }
        if (player.name !== null && player.name !== '') {
            player_info_array.push(player.name);
        }
        return player_info_array.join(' ');
    }
}

function get_event_info(eventDom) {
    let link=eventDom.querySelector('.event-title-link').href;
    let defer=q.defer();
    session.do_request(link, 'GET', null, function(error, response, body) {
        if (response.statusCode !== 200) {
            defer.reject('Error parsing events ('+response.statusCode+')\n'
                    +error);
        }
        let nhEvent=new Event(body);
        if (nhEvent.link === null) {
            nhEvent.link = link;
        }
        if (nhEvent.inPlayers.length === 0 &&
                nhEvent.outPlayers.length === 0 && 
                nhEvent.nonAnsweredPlayers.length === 0) {
            console.warn(eventLog+'WTF, no data found');
        }
        let inPlayersString;
        if (nhEvent.inPlayers.length > 0) {
            let players=[];
            for (let i=0; i<nhEvent.inPlayers.length; i++) {
                let player_string=get_player_info_string(nhEvent.inPlayers[i]);
                players.push(player_string);
            }
            inPlayersString=players.join(', ');
        } else {
            inPlayersString='none!';
        }
        let outPlayersString;
        if (nhEvent.outPlayers.length > 0) {
            let players=[];
            for (let i=0; i<nhEvent.outPlayers.length; i++) {
                let player_string=get_player_info_string(nhEvent.outPlayers[i]);
                players.push(player_string);
            }
            outPlayersString=players.join(', ');
        } else {
            outPlayersString='none!';
        }
        let nonAnsweredPlayersString;
        if (nhEvent.nonAnsweredPlayers.length > 0) {
            let players=[];
            for (let i=0; i<nhEvent.nonAnsweredPlayers.length; i++) {
                let player_string=get_player_info_string(nhEvent.nonAnsweredPlayers[i]);
                players.push(player_string);
            }
            nonAnsweredPlayersString=players.join(', ');
        } else {
            nonAnsweredPlayersString='none!';
        }
        let nhEventDateString=dateformat(nhEvent.date, 'dd.mm.yyyy @ HH:MM');
        defer.resolve('---------------------------------------------------\n'
                +nhEventDateString+': '+nhEvent.name+' ('+nhEvent.link+')\n'
                +'---------------------------------------------------\n'
                +'In ('+nhEvent.inPlayers.length+'):\n'
                +inPlayersString+'\n'
                +'---------------------------------------------------\n'
                +'Out ('+nhEvent.outPlayers.length+'):\n'
                +outPlayersString+'\n'
                +'---------------------------------------------------\n'
                +'? ('+nhEvent.nonAnsweredPlayers.length+'):\n'
                +nonAnsweredPlayersString+'\n'
                +'---------------------------------------------------\n\n');
    });
    return defer.promise;
}

// The whole thing's run by initializing session and starting the handle
let session_callback=function(error, response, body) {
    console.log('calling back');
    if (response.statusCode !== 200 && 
            response.statusCode !== 302 &&
            response.statusCode !== 301) {
        console.error('Error opening session ('+response.statusCode+')');
        console.error(error);
        return;
    }
    Players.initPlayers(domain+'players', session.headers).then(function(success) {
        if (success.length === 0) {
            console.error('Error fetching players');
            return;
        }
        playersCache=success;
        fetch_events();
    }, function(error) {
        console.error('Error initializing players cache');
        console.error(error);
    });
};

// Aka. init
session.login(domain, username, password, session_callback);

