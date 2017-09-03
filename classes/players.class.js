'use strict';

const request=require('request'),
      q=require('q');

const Nimenhuuto=require('./nimenhuuto.class.js'),
      Player=require('./player.class.js');

class Players extends Nimenhuuto {
    constructor(domObject) {
        super(domObject);
        this.players=[];
    }

    static initPlayers(url, headers) {
        console.log('Initializing players to cache');
        let defer=q.defer();
        request.get({url: url, headers: headers}, function(error, response, body) {
            if (response.statusCode !== 200) {
                console.error('Error fetching player data ('+response.statusCode+')');
                console.error(error);
                defer.reject('Error fetching player data ('+response.statusCode+')\n'+error);
            }
            let players=new Players(body);
            players.parsePlayers();
            defer.resolve(players);
        });
        return defer.promise;
    }

    parsePlayers() {
        let players=this.domObject.querySelectorAll('.playercard');
        players.forEach(player => {
            let playerObj=new Player(player.outerHTML);
            this.addPlayer(playerObj);
        });
    }

    addPlayer(player) {
        this.players.push(player);
    }

    getPlayer(player_id) {
        let player=this.players.filter(player => player.id === player_id);
        if (player.length === 0) {
            console.error('Player with id '+player_id+' not found!');
            return null;
        }
        return player[0];
    }
};

module.exports=Players;

