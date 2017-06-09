const printError = require('../util/printError');
const Raven = require('raven');

require('dotenv').config();

class Sentry {

    constructor() {
        // configure and install raven for sentry
        Raven.config(process.env.SENTRY_DSN).install();
    }

    /**
     * Wrapper for Raven.context
     * @param   {Function} fn Context function captures all exceptions and handles them
     */
    context(fn) {
        Raven.context(fn);
    }

    /**
     * Wrapper for Raven.wrap
     * @param   {Function} fn Wrap the function to be executed later.
     */
    wrap(fn) {
        Raven.wrap(fn);
    }

    /**
     * Simulates Raven.context for async functions
     * @param   {Function} fn Async context
     */
    async asyncContext(fn) {
        try {
            await fn();
        }
        catch (err) {
            this.captureException(err);
        }
    }

    /**
     * Wrapper for Raven.captureException
     * @param   {Object} err Exception from try/catch
     */
    captureException(err) {
        // print error
        printError(err);
        // capture the exeption with raven
        Raven.captureException(err);
    }

    /**
     * Wrapper for Raven.captureBreadcrumb
     * @param   {Object} breadcrumb Breadcrumb object
     */
    captureBreadcrumb(breadcrumb) {
        Raven.captureBreadcrumb(breadcrumb)
    }

    /**
     * Wrapper for Raven.captureMessage
     * @param   {String|Object}  message [description]
     */
    captureMessage(message) {
        Raven.captureMessage(message);
    }

}

module.exports = new Sentry();
