const request = require('request-promise');
const Sentry = require('./sentry');

class AWIS {

    /**
     * 
     * @param {String} apiKey The API key for AWIS
     */
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Provides information about a website.
     * @param {String|String[]} urls A single URL or an array of URLs. Only processes a max of 5 urls.
     * @param {'Rank'|'RankByCountry'|'UsageStats'|'AdultContent'|'Speed'|'Language'|'LinksInCount'|'SiteData'|'Categories'|'TrafficData'|'ContentData'} responseGroup Response Groups
     * @returns {Array|Object} Array (or just one object) containing response data.
     * 
     * @see https://awis.alexa.com/developer-guide/actions_urlinfo
     */
    async getURLInfo(urls, responseGroup) {
        // Form request URL.
        let uri = `https://awis.api.alexa.com/api?Action=UrlInfo&Output=json`;

        // See if urls param is an array or not.
        if (!Array.isArray(urls)) {
            // Add the single Url on for the request uri.
            uri += `&Url=${urls}`;
            // Add the response group.
            uri += `&ResposeGroup=${responseGroup}`;
        }
        else {
            // Splice off the first five for the batch.
            const five = urls.splice(0, 5);
            // Add the shared response group
            uri += `&UrlInfo.Shared.ResponseGroup=${responseGroup}`;
            // Add the urls to the request uri.
            uri += five.map((url, i) => `&UrlInfo.${i+1}.Url=${url}`).join('');
        }

        // Perform the request and return the result.
        const response = JSON.parse(await request({
            uri,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey
            }
        }));

        // Get the results from the response object.
        const results = response['Awis']['Results'];

        // Single URL results.
        if (!Array.isArray(results['Result'])) {            
            const statusCode = results['ResponseStatus']['StatusCode'];
            const response = results['Result']['Response'];
            if (statusCode != 200) {
                Sentry.captureMessage('Status Code: ' + statusCode + '\n' + response);
                return { error: { code: statusCode, message: response } };
            }
            const trafficData = results['Result']['Alexa']['TrafficData'];
            return { url: trafficData.DataUrl, rank: trafficData.Rank };
        }

        const parsed = [];
        const result = results['Result'];
        const status = results['ResponseStatus'];

        for (let i = 0; i < result.length; i++) {
            const r = result[i]['Alexa'];
            if (status[i]['StatusCode'] != 200)
                parsed.push({ error: { code: status[i]['StatusCode'], TrafficData: r['TrafficData'], Request: r['Request'] } })
            else
                parsed.push({ url: r['TrafficData']['DataUrl'], rank: r['TrafficData']['Rank'] });
        }

        return parsed;
    }
}

module.exports = AWIS;
