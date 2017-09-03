'use strict';
const Nimenhuuto=require('./nimenhuuto.class.js');

class Event extends Nimenhuuto {

    constructor(domObject) {
        super(domObject);

        this.id=this.domObject.querySelector("input[type='hidden'][name='message[event_id]']").value;
        let dateTimeString=this.domObject.querySelector('.dtstart').getAttribute('datetime');
        this.date=new Date(dateTimeString);
        let title=this.domObject.querySelector('h1.summary');
        this.type={
            identifier: title.querySelector('.event_label').getAttribute('class').substring(12),
            title: title.querySelector('.event_label').textContent.trim()
        };
        if (title.querySelector('.event_information') !== null && 
                title.querySelector('.event_information').textContent.trim() !== '') {
            this.name=this.type.title+': '+title.querySelector('.event_information').textContent.trim();
         } else {
            this.name=this.type.title;
        }
        this.link=this.domObject.querySelector('form#new_enrollment').getAttribute('action').replace(/^(.*?)\/events\/(\d+)\/(.*)$/, '$1/events/$2/');

        this.inPlayers=this.get_players_by_enrollment('in');
        this.outPlayers=this.get_players_by_enrollment('out');
        this.nonAnsweredPlayers=this.get_players_by_enrollment('?');
    }

    get_players_by_enrollment(joinStatus) {
        let joinStatusInt;
        switch (joinStatus) {
            case 'in':
                joinStatusInt=1;
                break;
            case 'out':
                joinStatusInt=2;
                break;
            case '?':
                joinStatusInt=3;
                break;
            default:
                joinStatusInt=3;
        }
        return this.domObject.querySelectorAll('#zone_'+joinStatusInt+' .player_type_1');
    }

};

module.exports=Event;

