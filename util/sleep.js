/**
 * sleep.js
 * A simple async sleep
 * @param {Number} timeout Time in milliseconds
 * @returns {Promise} Promise that completes when time is done
 */
module.exports = timeout => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
};
