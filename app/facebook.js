/**
 * facebook.js
 * Simple interface to make Facebook requests
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

const request = require('request-promise');
const path = require('path');
const querystring = require('querystring');

const PREFIX = 'https://graph.facebook.com/';

class Facebook {

    constructor(client_id, client_secret) {
        this.client_id = client_id;
        this.client_secret = client_secret;
        this.access_token = null;
    }

    async authenticate() {
        // already authenticated
        if (this.access_token != null)
            return;

        // get token from Facebook
        const token = await request(`${PREFIX}/oauth/access_token?client_id=${this.client_id}&client_secret=${this.client_secret}&grant_type=client_credentials`);
        // store token
        this.access_token = JSON.parse(token).access_token;
    }

    async get(endpoint, args) {
        // add the access token to the args
        args['access_token'] = this.access_token;
        // construct URL to request
        const url = PREFIX + endpoint + '?' + querystring.stringify(args);
        // make the request and return the results
        return JSON.parse(await request(url));
    }

}

module.exports = Facebook;
