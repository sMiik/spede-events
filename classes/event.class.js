'use strict';

const dateformat=require('dateformat'),
      // custom classes
      Nimenhuuto=require('./nimenhuuto.class.js');

class Event extends Nimenhuuto {

    constructor(domObject, archiveEvent) {
        super(domObject);

        if (this.domObject.querySelector("input[type='hidden'][name='message[event_id]']") === null) {
            return;
        }
        this.archiveEvent=archiveEvent;
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

        this.init_players();
        this.archiveEvent=false;
    }

    init_players() {
        const ref=this;
        ref.players={'in':[],'out':[],'?':[]};
        Object.keys(ref.players).map(function(key, idx) {
            ref.players[key]=ref.get_players_by_enrollment(key);
        });
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

    get_event_info() {
        let thisDateString=dateformat(this.date, 'dd.mm.yyyy @ HH:MM');
        if (this.archivedEvent) thisDateString += ' (ARCHIVE)';
        return '---------------------------------------------------\n'
                +thisDateString+': '+this.name+' ('+this.link+')\n'
                +'---------------------------------------------------';
    }

    get_object() {
        return {
            'id': this.id,
            'link': this.link,
            'name': this.name,
            'date': dateformat(this.date, 'yyyy-mm-dd')+'T'+dateformat(this.date, 'HH:MM'),
            'type': this.type,
            'players':{
                'in': [].slice.call(this.players['in']).map(playerDom => playerDom.id),
                'out': [].slice.call(this.players['out']).map(playerDom => playerDom.id),
                '?': [].slice.call(this.players['?']).map(playerDom => playerDom.id)
            },
            'request_date': this.request_date
        };
    }

};

module.exports=Event;

