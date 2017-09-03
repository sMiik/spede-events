'use strict';
const jsdom=require('jsdom');

class Nimenhuuto {
    constructor(domObject) {
        this.domObject=new jsdom.JSDOM(domObject).window.document;
    }
};

module.exports=Nimenhuuto;

