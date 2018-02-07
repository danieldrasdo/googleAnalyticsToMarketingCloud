// ~~~~~~~~~~ FUNCTIONS START ~~~~~~~~~~
//Adds a method to the Date object that adds days, without mutation, to the supplied date. (ECMA 'Date' was set up as a mutable class rather than an immutable structure.)
Date.prototype.addDays = function(days) {
  var d = new Date(this.valueOf());
  d.setDate(d.getDate() + days);
  return d;
}

//Adds a method to the Date object that days between to dates
Date.daysBetween = function(date1, date2) {
  //Get 1 day in milliseconds
  var one_day=1000*60*60*24;

  // Convert both dates to milliseconds
  var date1_ms = date1.getTime();
  var date2_ms = date2.getTime();

  // Calculate the difference in milliseconds
  var difference_ms = date2_ms - date1_ms;

  // Convert back to days and return
  return Math.round(difference_ms/one_day);
}

//Keeps a running log of time-stamped app events
function logMe(str, boolean) {
  let now = new Date();

  if ( logMe.arguments.length == 1 ) {
    boolean = true;
  }
  const timestamp = boolean;

  if (timestamp) {
    logDetails += (now.getTime() + '|' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString() + '|');
  }
  logDetails += str;
  if (timestamp) {
    logDetails += '|';
  }
}

//Ends the time-stamped log and returns
function endAndReturn(error) {
  if (error) {
    logDetails += err;
  }
  logDetails += 'ENDED';
  console.log(logDetails);
  if (error) {
    sendEmailAlert(
      'yourEmail@yourDomain.com',
      ['yourEmail@gmail.com','yourEmail@yourCompany.com'],
      'Error occurred!',
      'The following error occurred on this run of the GoogleAnalytics Node App.\n' + err + '\n\n\nThe full log details are as follows...\n' + logDetails + '\n',
      alertSent
    );
  } else {
    return;
  }
}

//Returns keywords string for use in the filter parameter of a google analytics request
function createKeywords(date) {
  let now = new Date(date);
  return '^' + (now.getFullYear()) + '' + ('0' + (now.getMonth() + 1)).slice(-2) + '' + ( ('0' + (now.getDate())).slice(-2) ) + '$';
}

//Returns an array of rows to api into a salesforce REST call
function buildRowSetArray(rows, headers) {
  let results = [];
  for (var i = 0; i < rows.length; i++) {
    let obj = {'keys':{},'values':{}};
    for (var j = 0; j < rows[i].length; j++) {
      let name = headers[j].name.toString(),
          type = headers[j].dataType.toString(),
          value = rows[i][j];

      if (name.slice(0, 3) === 'ga:') {
        name = name.substr(3);
      }
      //Possible dataTypes... STRING, INTEGER, PERCENT, TIME, CURRENCY, FLOAT https://developers.google.com/analytics/devguides/reporting/metadata/v3/devguide#attributes
      if (type === 'INTEGER' || type === 'PERCENT' || type === 'CURRENCY') {
        value = Number(value);
      } else {
        value.toString();
      }

      if ( name === 'campaign' || name === 'keyword' ) {
        obj['keys'][name] = value;
      } else {
        if ( (type === 'PERCENT' || type === 'CURRENCY') && value.toString().length > 10) {
          obj['values'][name] = precisionRound(value, 10);
        } else {
          obj['values'][name] = value;
        }
      }
    }
    results.push(obj);
  }
  return results;
}

//Returns a number rounded up to the nearest supplied precision
function precisionRound(number, precision) {
  var factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
}

//Gets analytics data after the Google API request is authorized
function requestAuthorized(err, tokens) {
  if (err) {
    endAndReturn('Google API request did not authorize.');
  } else {
    getAnalytics(postRowSet);
  }
}

//Gets analytics data and runs the callback
function getAnalytics(cb) {
  analytics.data.ga.get({
    auth: jwtClient,
    ids: 'ga:XXXXXXX',//Your Google Analytics ID, check out their query explorer for more details, https://ga-dev-tools.appspot.com/query-explorer/
    'start-date': formatDate(sentDate),
    'end-date': formatDate(endingDate),
    metrics: 'ga:sessions,ga:bounces,ga:bounceRate,ga:transactions,ga:transactionsPerSession,ga:transactionRevenue,ga:transactionRevenuePerSession',
    dimensions: 'ga:campaign,ga:source,ga:keyword',
    sort: 'ga:keyword',
    filters: 'ga:keyword=~' + createKeywords(sentDate) + ';ga:medium==email',
    samplingLevel: 'HIGHER_PRECISION'
  }, cb);
}

//Posts the RowSet array to the Google Analytics Data Extension
function postRowSet(err, response) {
  if (err) {
    endAndReturn('Error occurred when trying to get Google Analytics API data (sentDate: ' + formatDate(sentDate) + ').');
  } else {
    logMe(formatDate(sentDate) + ': ', false);
    if (response.data.totalResults > 0) {
      logMe(response.data.totalResults + ' found, ', false);
      RestClient.post({
        uri: '/hub/v1/dataeventsasync/key:google-analytics/rowset',
        json: true,
        body: buildRowSetArray(response.data.rows, response.data.columnHeaders)
      }, (err, res) => {
        if (err) {
          endAndReturn('Error occurred when trying to post FuelRest data (sentDate: ' + formatDate(sentDate) + ').');
        } else {
          logMe('posted! ', false);
          continueProcessingChecker();
        }
      });
    } else {
      logMe('0 found, skipped! ', false);
      continueProcessingChecker();
    }
  }
}

//Checks if app needs to process more days
function continueProcessingChecker() {
  if (sentDate < today.addDays(-1)) {
    sentDate.setDate(sentDate.getDate() + 1);
    endingDate = sentDate.addDays(7);
    getAnalytics(postRowSet);
  } else {
    logDetails += '|';//I know, this is kinda cheating...
    logMe('Done! All days processed.');
    endAndReturn();
  }
}

//Returns the supplied date formatted as YYYY-MM-DD
function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

//Sends an email alert if something goes wrong, then runs the callback
function sendEmailAlert(sender, recipients, subject, message, cb) {
  nodemailerMailgun.sendMail({
    from: sender,
    to: recipients,// An array if you have multiple recipients.
    //cc:'second@domain.com',
    //bcc:'secretagent@company.gov',
    subject: 'GoogleAnalytics Node JS App: ' + subject,
    'h:Reply-To': sender,
    //You can use "html:" to send HTML email content. It's magic!
    //html: code,
    //You can use "text:" to send plain-text content. It's oldschool!
    text: message
  },
  cb
  );
}

//Runs if an email alert was sent
function alertSent(err, info) {
  if (err) {
    logMe('\nError, alert email did not send.');
    return;
  } else {
    endAndReturn();
  }
}
// ~~~~~~~~~~ FUNCTIONS END ~~~~~~~~~~

// ~~~~~~~~~~ VARIABLES START ~~~~~~~~~~
const google = require('googleapis');
const analytics = google.analytics('v3');
const googleKey = require('./googleKeys.json');//Get the Keys.json file from google console, view the googleKeys_SAMPLE.json, edit it, and remove '_SAMPLE'
const jwtClient = new google.auth.JWT(
  googleKey.client_email,
  null,
  googleKey.private_key,
  ['https://www.googleapis.com/auth/analytics'],// an array of auth scopes
  null
);

const FuelRest = require('fuel-rest');
const fuelRestKey = require('./fuelRestKeys.json');//View the fuelRestKeys_SAMPLE.json, edit it, and remove '_SAMPLE'
const RestClient = new FuelRest(fuelRestKey);

const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');//See this repo for more info, https://github.com/orliesaurus/nodemailer-mailgun-transport
const mailgunKey = require('./mailgunKeys.json');//View the mailgunKeys_SAMPLE.json, edit it, and remove '_SAMPLE'
const nodemailerMailgun = nodemailer.createTransport(mg(mailgunKey));

//Start a log of events
let logDetails = '';

let today = new Date();
//If you ever need to go back and re-process dates, simply hard set the date below and run it (as opposed to a dynamic date).
//let sentDate = new Date('01/15/2018');
let sentDate = today.addDays(-14);
let endingDate = sentDate.addDays(7);
// ~~~~~~~~~~ VARIABLES END ~~~~~~~~~~
logMe('STARTED');

logMe('Processing ' + Date.daysBetween(sentDate, today) + ' days, starting from ' + formatDate(sentDate) + ' to today (' + formatDate(today) + ').');

jwtClient.authorize(requestAuthorized);
