'use strict';

const request=require('request'),
      q=require('q'),
      dateformat=require('dateformat'),
      // custom classes
      Nimenhuuto=require('./nimenhuuto.class.js');

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

    get_event_info() {
        let thisDateString=dateformat(this.date, 'dd.mm.yyyy @ HH:MM');
        return '---------------------------------------------------\n'
                +thisDateString+': '+this.name+' ('+this.link+')\n'
                +'---------------------------------------------------';
    }

    static request_event(event_link, headers) {
        let defer=q.defer();
        console.og(event_link);
        request({url: event_link, headers: headers, method: 'GET', callback: function(error, response, body) {
            if (response.statusCode !== 200) {
                defer.reject('Error fetching event '+event_link+' ('+response.statusCode+')\n'
                        +error);
                return defer.promise;
            }
            let nhEvent=new Event(body);
            if (nhEvent.link === null) {
                nhEvent.link = event_link;
            }
            defer.resolve(nhEvent);
        }});
        return defer.promise; 
    }

};

module.exports=Event;

