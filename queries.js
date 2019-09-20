const promise = require('bluebird');


const options = {
    // Initialization Options
    promiseLib: promise
};

const pgp = require('pg-promise')(options);

const connectionString = process.env.DATABASE_URL;
pgp.pg.defaults.ssl = true;
const db = pgp(connectionString);
console.log('Connected to DB');
// add query functions
async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function logEvent(org, object, replayId, operation, recordId) {

    return db.one('insert into public.logtable(org, object, eventdate, replayid, operation, recordid, status) VALUES($1, $2, NOW(), $3, $4, $5, $6) RETURNING logid',
        [org, object, replayId, operation, recordId, 'RECEIVED'])
        .then((data) => {
            console.log(`logEvent for ${replayId} success logid: ${data.logid}`);
            return Promise.resolve(data.logid);
        })
        .catch((err) => {
            console.error(`**logEvent for ${replayId} error: ${err}`);
            return Promise.reject(err);
        });
}

async function updateEvent(logid, status) {
    return db.tx(t => {
        t.none('UPDATE public.logtable SET status = $1 WHERE logid = $2', [status, logid]);
    })
        .then((_data) => {
            console.log(`updateEvent for ${logid} success`);
            return Promise.resolve(logid);
        })
        .catch((err) => {
            console.error('ERROR:', err);
            return Promise.reject(err);
        });
}

async function insertRecord(origin, destination, object, recordId) {
    if (object === 'Account') {
        console.log(`INSERT Account record in ${destination}`);
        return db.one(`insert into ${destination}.Account 
                    (type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,
                billingcountry,billingcity,annualrevenue,accountnumber,share__c) 
                select type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,
                billingcountry,billingcity,annualrevenue,accountnumber,$2 from ${origin}.Account where external_id__c = $1 RETURNING id`,
            [recordId, 'Imported'])
            .then((data) => {
                return Promise.resolve();
            })
            .catch((err) => {
                db.none(`UPDATE ${origin}.account SET share_details__c = '${err}' WHERE ${origin}.account.external_id__c = $1`, [recordId]);
                return Promise.reject(err);
            });
    } else if (object === 'Opportunity') {
        console.log(`INSERT Opportunity record in ${destination}`);
        console.log(`... but first, we check if related Account record exists in ${destination}!`);

        return db.one(`SELECT * FROM ${origin}.opportunity RIGHT JOIN ${destination}.account ON ${origin}.opportunity.account__external_id__c = ${destination}.account.external_id__c WHERE ${origin}.opportunity.external_id__c = $1`, [recordId])
            .then((data) => {
                return db.none(`insert into ${destination}.Opportunity (type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, account__external_id__c) 
                select type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, account__external_id__c 
                from ${origin}.Opportunity where external_id__c=$1`, [recordId]);
            })
            .then(() => {
                return Promise.resolve();
            })
            .catch((err) => {
                db.none(`UPDATE ${origin}.opportunity SET share_details__c = '${err}' WHERE ${origin}.opportunity.external_id__c = $1`, [recordId]);
                return Promise.reject(err);
            });
    }
}

async function updateRecord(origin, destination, object, recordId) {
    if (object === 'Account') {
        console.log(`UPDATE Account record in ${destination}`);
        return db.none(`UPDATE ${destination}.Account 
                SET type = original.type , rating = original.rating , name = original.name , isdeleted = original.isdeleted , industry = original.industry , 
                external_id__c = original.external_id__c , description = original.description , billingstreet = original.billingstreet , 
                billingstate = original.billingstate , billingpostalcode = original.billingpostalcode , billingcountry = original.billingcountry ,
                 billingcity = original.billingcity , annualrevenue = original.annualrevenue , accountnumber = original.accountnumber
                FROM (select type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,
                billingcountry,billingcity,annualrevenue,accountnumber from ${origin}.Account where external_id__c=$1) AS original 
                WHERE ${destination}.Account.external_id__c=$1`,
            [recordId])
            .then(() => {
                return Promise.resolve();
            })
            .catch((err) => {
                db.none(`UPDATE ${origin}.account SET share_details__c = '${err}' WHERE ${origin}.account.external_id__c = $1`, [recordId]);
                return Promise.reject(err);
            });
    } else if (object === 'Opportunity') {
        console.log(`UPDATE Opportunity record in ${destination}`);
        return db.none(`UPDATE ${destination}.Opportunity 
                SET type = original.type, systemmodstamp = original.systemmodstamp, stagename = original.stagename, sfid = original.sfid, 
                    probability = original.probability, nextstep = original.nextstep, name = original.name, iswon = original.iswon, 
                    isdeleted = original.isdeleted, id = original.id, external_id__c = original.external_id__c, createddate = original.createddate, 
                    closedate = original.closedate, amount = original.amount, accountid = original.accountid, 
                    account__external_id__c = original.account__external_id__c 
                FROM 
                (select type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, accountid, account__external_id__c 
                    from ${origin}.Opportunity 
                    where external_id__c=$1) AS original 
                WHERE ${destination}.Opportunity.external_id__c=$1`,
            [recordId])
            .then(() => {
                return Promise.resolve();
            })
            .catch((err) => {
                db.none(`UPDATE ${origin}.opportunity SET share_details__c = '${err}' WHERE ${origin}.opportunity.external_id__c = $1`, [recordId]);
                return Promise.reject(err);
            });
    }
}

async function updateRecordStatus(logid, schema, object, recordId, status) {
    return db.none(`UPDATE ${schema}.${object} 
                SET share__c = $1 WHERE external_id__c=$2`,
        [status, recordId])
        .then(() => {
            return Promise.resolve(logid);
        })
        .catch((err) => {
            return Promise.reject(err);
        });
}

async function syncRecord(logid, origin, destination, operation, object, recordId) {
    await timeout(5000);
    if (operation === 'INSERT') {
        return insertRecord(origin, destination, object, recordId)
            .then(() => {
                console.log(`New record in ${object} from ${origin} to ${destination} ID: ${recordId}`);
                return Promise.resolve(logid);
            })
            .catch((err) => {
                console.error('ERROR:', err);
                return Promise.reject(err);
            });
    } else if (operation === 'UPDATE') {
        return updateRecord(origin, destination, object, recordId)
            .then(() => {
                console.log(`Updated record in ${object} from ${origin} to ${destination} ID: ${recordId}`);
                return Promise.resolve(logid);
            })
            .catch((err) => {
                console.error('ERROR:', err);
                return Promise.reject(err);
            });
    }
}


module.exports = {
    logEvent,
    updateEvent,
    syncRecord,
    updateRecordStatus
};