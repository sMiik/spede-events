const config=require('config'),
      request=require('request'),
      jsdom=require('jsdom'),
      q=require('q'),
      dateformat=require('dateformat'),
      Players=require('./classes/players.class.js'),
      Event=require('./classes/event.class.js');

// Constants from configurations
const username=config.get('credentials.username'),
      password=config.get('credentials.password'),
      abbr=config.get('team.abbreviation'),
      domain='https://'+abbr+'.nimenhuuto.com/';

// Globally used variables
var reqHeaders={};
var playersCache=new Players();

// Initial stuff to keep things rocking
function fetch_headers(headers) {
    console.log('Fetching headers for further requests');
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
    let request_headers={}
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
    reqHeaders={};
    for (let i in request_headers) {
        reqHeaders[i]= Array.isArray(request_headers[i]) ? request_headers[i].join('; ') : request_headers[i];
    }
}

// Get players to cache to only have to fetch once
function init_player_cache() {
    console.log('Initializing players to cache');
    let defer=q.defer();
    request.get({url: domain+'players', headers: reqHeaders}, function(error, response, body) {
        if (response.statusCode !== 200) {
            console.error('Error fetching player data ('+response.statusCode+')');
            console.error(error);
            defer.reject('Error fetching player data ('+response.statusCode+')\n'+error);
        }
        let players=new Players(body);
        defer.resolve(players);
    });
    return defer.promise;
}

// Open session for handling the stuff
function open_session(username, password, callback) {
    console.log('Opening session for handling everything');
    request.get(domain+'sessions/new', function(error, response, body) {
        if (response.statusCode !== 200) {
            console.error('Error fetching login form ('+response.statusCode+')');
            console.error(error);
            return;
        }
        fetch_headers(response.headers);
        let loginDom=new jsdom.JSDOM(body).window.document;
        let authToken=loginDom.querySelector("input[type='hidden'][name='authenticity_token']").value;
        // Login
        let loginForm={
            authenticity_token: authToken,
            login_redirect_url: '',
            login_name: username,
            password: password,
            commit: 'Kirjaudu',
        };
        request({url: domain+'sessions', method: 'POST', headers: reqHeaders, form: loginForm, callback: callback});
    });
}

function fetch_events() {
    console.log('Getting all the events (from first page)');
    request({url: domain+'events', headers: reqHeaders}, function(error, response, body) {
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
    request({url: link, headers: reqHeaders}, function(error, response, body) {
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
    if (response.statusCode !== 200 && 
            response.statusCode !== 302 &&
            response.statusCode !== 301) {
        console.error('Error opening session ('+response.statusCode+')');
        console.error(error);
        return;
    }
    init_player_cache().then(function(success) {
        if (success.length === 0) {
            console.error('Error fetching players');
            return;
        }
        playersCache=success;
        fetch_events();
    }, function(error) {
        console.error(error);
    });
};

// Aka. init
open_session(username, password, session_callback);

