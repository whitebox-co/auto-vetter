/**
 * sleep.js
 * A simple async sleep
 */
module.exports = timeout => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
};
