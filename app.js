const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const jsforce = require('jsforce');
const proc = require('./events');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
app.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const username = 'admin@miguel.orga.demo';
const password = 'sfdc1234';
const conn = new jsforce.Connection({});

const username2 = 'admin@miguel.orgb.demo';
const password2 = 'sfdc1234';
const conn2 = new jsforce.Connection({});

conn.login(username, password, (err, userInfo) => {
  if (err) {
    return console.log(err);
  }
  console.dir(`Connected to Org A`);
  conn.streaming.topic("/event/Synch__e").subscribe((message) => {
    console.dir(`Event from Org A ${JSON.stringify(message)}`);
    proc.processEvent('orga', message);
  });
  return 'ok';
});


conn2.login(username2, password2, (err, userInfo) => {
  if (err) {
    return console.log(err);
  }
  console.dir(`Connected to orgB`);
  conn2.streaming.topic("/event/Synch__e").subscribe((message) => {
    console.dir(`Evento from Org B ${JSON.stringify(message)}`);
    proc.processEvent('orgb', message);
  });
  return 'ok';
});

module.exports = app;