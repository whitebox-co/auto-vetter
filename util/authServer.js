/**
 * authServer.js
 * This file handles redirecting the user to login with Google to handle OAuth
 * as well as serving up an HTTP server for the callback and passing back the
 * creds all done with asyn/await to reduce this into one function call.
 * Methods for spawn and kill are available as well for other use.
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

const open = require('open');
const express = require('express');
const app = express();
const shutdownable = require('http-shutdown');

// create variable for the server
let server;

/**
 * @typedef {Object} Creds
 * @property {String} code Authentication code from URL
 */

/**
 * Used to authenticate user to Google APIs
 * @param {String} url 
 * @returns {Creds}
 */
const auth_me = async url => {
    // open the url
    open(url);
    // spawn server and wait for creds
    const creds = await spawn();
    // kill server
    kill();

    // return the creds
    return creds;
}

/**
 * Spawn the web server
 * @returns {Promise<Creds>} Credentials from the URL's GET variables
 */
const spawn = () => {
    return new Promise((resolve, reject) => {
        // listen for the server and wrap with http shutdown to kill later
        server = shutdownable(app.listen(process.env.WEB_PORT));

        // create the catch for the OAuth callback
        app.get('/callback', (req, res) => {
            // send back a close me message
            res.send('<style>body{text-align:center;font-family:"Open Sans","Helvetica Nueue",Helvetica,Arial,sans-serif;}div{position:relative;top:50%;transform:translateY(-50%);}</style><div><h1>All done here</h1><p>You can close me now.</p></div>');

            resolve(req.query);
        });
    });
}

/**
 * Kills the web server
 */
const kill = () => {
    server.shutdown();
};

module.exports = { auth_me, spawn, kill };
