'use strict';

const Nimenhuuto=require('./nimenhuuto.class.js');

class Player extends Nimenhuuto {
    constructor(domObject){
        super(domObject);

        this.id=null;
        this.name=null;
        this.nickname=null;
        this.email=null;
        this.jersey=null;
        this.phone=null;

        this.id=this.domObject.querySelector('.playercard').id;
        let player_title=this.domObject.querySelector('h3');
        let player_nickname=player_title.querySelector('small').textContent.trim().substring(3);
        this.name=player_title.textContent.replace('// '+player_nickname, '').trim();
        this.nickname=player_nickname;
        let player_email=this.domObject.querySelector('span.email').textContent.trim();
        let email_doms=this.domObject.querySelectorAll('span.email');
        for (let i=0; i<email_doms.length; i++) {
            if (email_doms[i].textContent.match(/^(.*)@(.*)\.(.*)$/)) {
                player_email=email_doms[i].textContent.trim();
            }
        }   
        this.email=player_email;
        let player_jersey = '-';
        let var_name_doms=this.domObject.querySelectorAll('.var_name');
        for (let i=0; i<var_name_doms.length; i++) {
            if (var_name_doms[i].textContent.indexOf('Pelinumero') !== -1) {
                player_jersey=var_name_doms[i].parentNode.textContent.replace('Pelinumero:','').trim();
            }
        }   
        if (player_jersey !== null && player_jersey.length > 0) {
            player_jersey=player_jersey.trim();
        }   
        this.jersey=player_jersey.match(/^\d+$/) ? '#'+player_jersey : '?';
        let player_phone='-';
        let player_phone_dom=this.domObject.querySelector("a[href^='tel']");
        if (player_phone_dom !== null) {
            player_phone=player_phone_dom.textContent.trim();
        }   
        this.phone=player_phone;
    }
};

module.exports=Player;

