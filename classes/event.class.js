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
		const ref=this;
        return {
            'id': ref.id,
            'link': ref.link,
            'name': ref.name,
            'date': dateformat(ref.date, 'yyyy-mm-dd')+'T'+dateformat(ref.date, 'HH:MM'),
            'type': ref.type,
            'players':{
                'in': [].slice.call(ref.players['in']).map(playerDom => ref.get_player_details(playerDom)),
                'out': [].slice.call(ref.players['out']).map(playerDom => ref.get_player_details(playerDom)),
                '?': [].slice.call(ref.players['?']).map(playerDom => ref.get_player_details(playerDom))
            },
            'request_date': this.request_date
        };
    }

	get_player_details(playerDom) {
		const playerId=playerDom.id;
		const playerName=playerDom.textContent.trim();
		const content=playerDom.getAttribute('data-content').trim();
		const lines=content.split('\n');
		var enrolledAt='';
		for (let i in lines){
			if (lines[i].indexOf('Ilmoittautunut') < 0) continue;
			enrolledAt=lines[i].trim().replace(/^<br(\s+)?\/>Ilmoittautunut:(\s+)?(.*)$/, '$3');
		}
		if (enrolledAt !== ''){
			var dateParts=enrolledAt.match(/^(\w{2}) (\d{1,2})\.(\d{1,2})\.(\d{4})? klo (\d{1,2}):(\d{1,2})$/);
			if (typeof dateParts[4] === 'undefined' || dateParts[4] === null || dateParts[4] === ''){
				dateParts[4] = new Date().getFullYear();
			}
			var date=new Date(dateParts[4], dateParts[2], dateParts[3], dateParts[5], dateParts[6]);
			enrolledAt=dateformat(date, 'isoDateTime').substr(0,19);
		}
		return { playerId, playerName, enrolledAt };
	}

};

module.exports=Event;

