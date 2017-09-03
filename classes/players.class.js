'use strict';

const Nimenhuuto=require('./nimenhuuto.class.js'),
      Player=require('./player.class.js');

class Players extends Nimenhuuto {
    constructor(domObject) {
        super(domObject);

        this.players=[];
        this.parsePlayers();
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

