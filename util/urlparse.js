/**
 * Formats the URL to remove invalid parts
 * @param {String} url 
 */
module.exports = url => {
    if (!url)
        return '';
    if (url.indexOf('@') != -1)
        return '';
    if (url.indexOf(',') != -1)
        url = url.split(',')[0];
    if (!url.startsWith('http'))
        url = 'http://' + url;
    if (url.endsWith(';'))
        url = url.slice(0, -1);

    return url.trim();
};
