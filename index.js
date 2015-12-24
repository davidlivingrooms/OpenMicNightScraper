var express = require('express');
var fs = require('fs');
var request = require('request-promise');
var cheerio = require('cheerio');
var pgp = require('pg-promise');
var Promise = require("bluebird");
var app     = express();
var connectionString = {
    host: 'localhost', // server name or IP address;
    port: 5432,
    database: 'openmicnight',
    user: 'openmicer',
    //password: 'user_password'
};
var db = pgp(connectionString);
var db = db(connectionString);
app.get('/scrape', function(req, res){
    var url = 'http://www.badslava.com/';

    request(url).then(function(html){
        var $ = cheerio.load(html);
        var blockQuoteLinks = $('blockquote a');
        var promiseArray = [];
        blockQuoteLinks.each(function(i, elem){
            var cityHref = 'http://www.badslava.com/' + $(this).attr('href');
            //TODO need to go to each page with type filter = comedy, music, and poety before doing this
            // If the openmic already exists then we just need to update the other type fields
            promiseArray.push(insertOpenMicsFromCityPage(cityHref, 'comedy'));
            promiseArray.push(insertOpenMicsFromCityPage(cityHref, 'music'));
            promiseArray.push(insertOpenMicsFromCityPage(cityHref, 'poetry'));
        });

        Promise.all(promiseArray).then(function(){
            console.log('All insert statements completed');
        });
    });
});

function getWeekdayFromElem(elem) {
    return "monday";
}

function getOpenMicRegularity(regularity) {
    switch(regularity){
        case 'Bi-weekly mic':
            return 'bi-weekly';
            break;
        case 'Weekly mic':
            return 'weekly';
            break;
        case 'Monthly mic':
            return 'monthly';
            break;
    }
}

function handleSignUpSiteOrEmail($, anchor, openMicDetail) {
    var hrefAttribute = $(anchor).attr('href');
    if (hrefAttribute.startsWith("mailto:")) {
        openMicDetail.openmicContactEmail = hrefAttribute.slice(7);
    }
    else{
        openMicDetail.signUpSite = hrefAttribute;
    }
}

function handleInfoWithNotesSection($, openmicElements, openMicDetail) {
    var notesAnchor = openmicElements[6];
    var onClickAttribute = $(notesAnchor).attr('onclick');
    var endOfAlertIndex = onClickAttribute.indexOf("'); return false;");
    openMicDetail.notes = onClickAttribute.slice(7, endOfAlertIndex);

    openMicDetail.isFree = openmicElements[7].data === "Free Mic";

    openMicDetail.openMicRegularity = getOpenMicRegularity(openmicElements[8].data);

    if (openmicElements[9].name === 'a'){
        handleSignUpSiteOrEmail($, openmicElements[9], openMicDetail);
        openMicDetail.phoneNumber = openmicElements[10].data === 'No phone calls' ? '' : openmicElements[10].data;
    }
    else{
        openMicDetail.phoneNumber = openmicElements[9].data === 'No phone calls' ? '' : openmicElements[9].data;
    }
}

function handleInfoWithoutNotesSection($, openmicElements, openMicDetail) {
    openMicDetail.isFree = openmicElements[6].data === "Free Mic";

    openMicDetail.openMicRegularity = getOpenMicRegularity(openmicElements[7].data);

    if (openmicElements[8].name === 'a'){
        handleSignUpSiteOrEmail($, openmicElements[8], openMicDetail);
        openMicDetail.phoneNumber = openmicElements[9].data === 'No phone calls' ? '' : openmicElements[9].data;
    }
    else{
        openMicDetail.phoneNumber = openmicElements[8].data === 'No phone calls' ? '' : openmicElements[8].data;
    }
}
function insertOpenMicsFromCityPage(cityUrl, type) {
    var _this = this;
    var insertStatement = 'insert into openmic(openmic_name, openmic_weekday, openmic_regulartiy, comedian, poet, ' +
        'musician, contact_email_address, contact_phone_number, venue_name, venue_address, state, city, sign_up_time, ' +
        'start_time, is_free, next_openmic_date, notes) values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,' +
        ' $15, $16, $17)';


    return request(cityUrl + '&type=' + type).then(function(html) {

    //TODO check to see if it already exists. if it does then just set the type flag to true

        console.log(cityUrl);
        var $ = cheerio.load(html);

        $('b').each(function(i, elem){

            if (openMicExistsAlready()) {//TODO this is async
                if (elem.parent) {
                    var openmicElements = elem.parent.children;
                    var weekday = getWeekdayFromElem(elem);
                    openmicElements = openmicElements.filter(function (obj) {
                        return obj.name !== 'br';
                    });

                    //First field is name text
                    var nameText = openmicElements[0].children[0].children[0].data;
                    var nameVenueObject = getNameAndVenueFromBoldElement(nameText);

                    //next to field is the address
                    var streetAddress = openmicElements[1].data;

                    var commaIndex = openmicElements[2].data.indexOf(',');
                    var city = openmicElements[2].data.slice(0, commaIndex);

                    var state = openmicElements[2].data.slice(commaIndex + 1, openmicElements[2].length);

                    var signUpTime = openmicElements[4].data;
                    var startTime = openmicElements[5].data;

                    var openMicDetail = {};
                    if (openmicElements[6].name === 'a') {
                        handleInfoWithNotesSection($, openmicElements, openMicDetail);
                    }
                    else {
                        handleInfoWithoutNotesSection($, openmicElements, openMicDetail);
                    }

                    var insertStatement = 'insert into openmic(openmic_name, openmic_weekday, openmic_regulartiy, comedian, poet, ' +
                        'musician, contact_email_address, contact_phone_number, venue_name, venue_address, state, city, sign_up_time, ' +
                        'start_time, is_free, next_openmic_date, notes) values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,' +
                        ' $15, $16, $17)';

                    var isComedianAllowed = false;
                    var isPoetryAllowed = false;
                    var isMusicianAllowed = false;

                    if (type === 'comedy') {
                        isComedianAllowed = true;
                    }
                    else if (type === 'music') {
                        isMusicianAllowed = true;
                    }
                    else if (type === 'poetry') {
                        isPoetryAllowed = true;
                    }

                    var values = [nameVenueObject.openmicName, weekday, openMicDetail.openMicRegularity, isComedianAllowed, isPoetryAllowed,
                        isMusicianAllowed, openMicDetail.contactEmailAddress, openMicDetail.contactPhoneNumber,
                        nameVenueObject.venueName, streetAddress, state, city, signUpTime, startTime,
                        openMicDetail.isFree, nextOpenMicDate, openMicDetail.notes];

                    //return db.one(insertStatement, values);
                }
            }
        });
    });
}

function getNameAndVenueFromBoldElement(nameText) {
    var delimiterIndex =  nameText.indexOf(' at ');
    if (delimiterIndex !== -1) {
        return {
            'openmicName': nameText.slice(0, delimiterIndex),
            'venueName': nameText.slice(delimiterIndex + 4, nameText.length)
        };
    }
    else{
        return {'openmicName': nameText, 'venueName': null}
    }
}

app.listen('8081')
console.log('Magic happens on port 8081');
exports = module.exports = app;