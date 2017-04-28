const childProcess = require('child_process'),
      moment       = require('moment'),
      config       = require('./config/config.json'),
      Promise      = require('bluebird');

module.exports = function (query) {
  return new Promise((resolve, reject) => {
    query = query.replace(/:/g, '*').replace(new RegExp('"', 'g'), '');
    const queryTo = Date.now();
    const queryFrom = Date.now() - config.kibana.searchFor;// for last 6 hours
    const indexDate = moment().format('YYYY.MM.DD.14');
    const cookie = config.kibana.cookie;
    const kibanaUrl = config.kibana.url;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' +
      ' (KHTML, like Gecko) Chrome/58.0.3029.81 Safari/537.36';
    const curlRequest = `curl '${kibanaUrl}/elasticsearch/_msearch?timeout=0&ignore_unavailable=true&preference=1493389129744' -s -H 'Origin:` +
      `${kibanaUrl}' -H 'Accept-Encoding: gzip, deflate, br' -H 'Accept-Language: en-US,en;q=0.8,ru;q=0.6' -H 'kbn-version: 4.5.0' -H 'User-Agent: `
      + `${userAgent}' -H 'Content-Type: application/json;charset=UTF-8' -H 'Accept: application/json, text/plain, */*' -H 'Referer: `
      + `${kibanaUrl}/app/kibana?' -H 'Cookie: ${cookie}' -H 'Connection: keep-alive' -H 'Save-Data: on' --data-binary $'{"index":["logstash-`
      + `${indexDate}"],"ignore_unavailable":true}\n{"size":500,"sort":[{"@timestamp":{"order":"desc","unmapped_type":"boolean"}}],` +
      `"query":{"filtered":{"query":{"query_string":{"analyze_wildcard":true,"query":"*${query }` +
      `*"}},"filter":{"bool":{"must":[{"range":{"@timestamp":{"gte":${queryFrom},"lte":${queryTo}` +
      `,"format":"epoch_millis"}}}],"must_not":[]}}}},"highlight":{"pre_tags":["@kibana-highlighted-field@"],` +
      `"post_tags":["@/kibana-highlighted-field@"],"fields":{"*":{}},"require_field_match":false,"fragment_size":2147483647},` +
      `"aggs":{"2":{"date_histogram":{"field":"@timestamp","interval":"1m","time_zone":"Asia/Baghdad","min_doc_count":0,` +
      `"extended_bounds":{"min":${queryFrom},"max":${queryTo}}}}},"fields":["*","_source"],"script_fields":{},` +
      `"fielddata_fields":["USER_CRASH_DATE","USER_APP_START_DATE","@timestamp","date","data.transaction.date",` +
      `"data.items.date","data.child_transactions.date","data.transactions.date","data.date_from","data.date_to",` +
      `"BUILD.VERSION.SECURITY_PATCH"]}\n' --compressed`;
    console.log(curlRequest);

    function shitToJson(str) {
      return str.replace(/\/n/g, '').replace(/\/r/g, '').replace(/=>/g, ':').replace(/nil/g, 'null');
    }

    childProcess.exec(curlRequest, (error, stdout, stderr)=> {
      if (stdout.toString().length === 0) {
        console.log('too little stdout');
        reject(`Error: ${stderr}`);
        return;
      }
      let data;
      try {
        data = JSON.parse(stdout);
      } catch (e) {
        console.log('malformed json!');
        reject(e + stdout + stderr);
        return;
      }
      if (data.responses === undefined || data.responses[0] === undefined
        || data.responses[0].hits === undefined || data.responses[0].hits.hits === undefined) {
        reject(JSON.stringify(data));
        return;
      }
      data = data.responses[0].hits.hits;
      data = data.map((logEntry) => {
        let msgData = 'no data';
        if (logEntry._source.data && logEntry._source.data[0]) {
          msgData = (logEntry._source.data[0]);
          msgData = shitToJson(msgData);
          try {
            msgData = JSON.parse(msgData);
          } catch (e) {
            msgData = `Failed to parse: ${msgData}`;
          }
          msgData.headers = 'hidden';
        }
        return {
          type: logEntry._type,
          timestamp: logEntry._source['@timestamp'],
          level: logEntry._source.level,
          message: logEntry._source['@message'],
          orderId: logEntry._source['@orderId'],
          data: msgData,
        };
      });
      resolve(JSON.stringify(data, null, 3));

    });
  });
};
