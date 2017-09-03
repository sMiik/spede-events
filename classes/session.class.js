'use strict';

const request=require('request'),
      jsdom=require('jsdom');

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

class Session {

    constructor() {
        console.log('Opening session for handling everything');
        this.headers={};
    }

    fetch_headers(headers) {
        console.log('Fetching headers for further requests');
        let request_headers={};
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
        let requestHeaders={};
        for (let i in request_headers) {
            requestHeaders[i]= Array.isArray(request_headers[i]) ? request_headers[i].join('; ') : request_headers[i];
        }
        return requestHeaders;
    }

    do_request(url, method, data, callback) {
        let ref=this;
        return request({url: url, method: method, headers: ref.headers, form: data, callback: callback});
    }

    login(domain, username, password, callback) {
        let ref=this;
        return this.do_request(domain+'sessions/new', 'GET', null, function(error, response, body) {
            if (response.statusCode !== 200) {
                console.error('Error fetching login form ('+response.statusCode+')');
                console.error(error);
                return;
            }
            ref.headers=ref.fetch_headers(response.headers);
            let loginDom=new jsdom.JSDOM(body).window.document;
            let authToken=loginDom.querySelector("input[type='hidden'][name='authenticity_token']").value;
            let loginForm={
                authenticity_token: authToken,
                login_redirect_url: '', 
                login_name: username,
                password: password,
                commit: 'Kirjaudu',
            };
            // Login
            ref.do_request(domain+'sessions', 'POST', loginForm, callback);
        });
    }

};

module.exports=Session;

