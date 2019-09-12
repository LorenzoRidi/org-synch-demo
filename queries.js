const promise = require('bluebird');


const options = {
    // Initialization Options
    promiseLib: promise
};

const pgp = require('pg-promise')(options);

const connectionString = process.env.DATABASE_URL;
pgp.pg.defaults.ssl = true;
const db = pgp(connectionString);
console.log('Conectado a la BBDD');
// add query functions

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
    console.log(`Imsertando registro en ${destination}`);
    if (object === 'Account') {

        return db.one(`insert into ${destination}.Account(type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,` +
                `billingcountry,billingcity,annualrevenue,accountnumber,share__c select type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,` +
                `billingcountry,billingcity,annualrevenue,accountnumber,$2 from ${origin}.Account where external_id__c = $1 RETURNING id`,
                [recordId, 'Imported'])
            .then((data) => {
                console.log(`Query: insert into ${destination}.Account(type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,
                billingcountry,billingcity,annualrevenue,accountnumber,share__c select type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,
                billingcountry,billingcity,annualrevenue,accountnumber,'Imported' from ${origin}.Account where external_id__c = ${recordId} RETURNING id`);
                console.log(`Insertado con éxito, ID: ${data.id}`);
                return Promise.resolve();
            })
            .catch((err) => {
                return Promise.reject(err);
            });
    }

    return db.none('insert into $1.Opportunity(type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, accountid, account__external_id__c) ' +
            'select type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, accountid, account__external_id__c from $2.Opportunity where external_id__c=$3',
            [destination, origin, recordId])
        .then(() => {
            return Promise.resolve();
        })
        .catch((err) => {
            return Promise.reject(err);
        });
}

async function updateRecord(origin, destination, object, recordId) {
    if (object === 'Account') {
        return db.none('UPDATE $1.Account SET type = original.rtype , rating = original.rating , name = original.name , isdeleted = original.isdeleted , industry = original.industry , external_id__c = original.external_id__c , description = original.description , billingstreet = original.billingstreet , billingstate = original.billingstate , billingpostalcode = original.billingpostalcode , billingcountry = original.billingcountry , billingcity = original.billingcity , annualrevenue = original.annualrevenue , accountnumber = original.accountnumber' +
                'FROM (select type,rating,name,isdeleted,industry,external_id__c,description,billingstreet,billingstate,billingpostalcode,' +
                'billingcountry,billingcity,annualrevenue,accountnumber from $2.Account where external_id__c=$3) AS original WHERE external_id__c=$3',
                [destination, origin, recordId])
            .then(() => {
                return Promise.resolve();
            })
            .catch((err) => {
                return Promise.reject(err);
            });
    }

    return db.none('UPDATE $1.Opportunity SET type = original.type, systemmodstamp = original.systemmodstamp, stagename = original.stagename, sfid = original.sfid, probability = original.probability, nextstep = original.nextstep, name = original.name, iswon = original.iswon, isdeleted = original.isdeleted, id = original.id, external_id__c = original.external_id__c, createddate = original.createddate, closedate = original.closedate, amount = original.amount, accountid = original.accountid, account__external_id__c = original.account__external_id__c FROM ' +
            '(select type, systemmodstamp, stagename, sfid, probability, nextstep, name, iswon, isdeleted, id, external_id__c, createddate, closedate, amount, accountid, account__external_id__c from $2.Account where external_id__c=$3) AS original WHERE external_id__c=$3',
            [destination, origin, recordId])
        .then(() => {
            return Promise.resolve();
        })
        .catch((err) => {
            return Promise.reject(err);
        });
}

async function syncRecord(logid, origin, destination, operation, object, recordId) {
    // 1 - Llamar a insert o update
    console.log(`Sincronizando registro: ${recordId} Operacion: ${operation} Origen: ${origin} Destino: ${destination}`);
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
    }
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


module.exports = {
    logEvent,
    updateEvent,
    syncRecord
};