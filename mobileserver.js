/*
 * Copyright 2010-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

//node.js deps

//npm deps

//app deps
var WebSocketServer = require('ws').Server;
var express = require('express');
var path = require('path');
var app = express();
var server = require('http').createServer();

app.use(express.static(path.join(__dirname, '/public')));

var sensordata = `{"light":474,"mois":8,"temp":26.9,"threshould":0}`;

var AWSIoTData = require('aws-iot-device-sdk');
const thingShadow = AWSIoTData.thingShadow;
const isUndefined = require("is-undefined");

// 1 is Mobile mode, 2 is device mode
const testMode = 1;
//begin module
   // Input your raspberry pi thing Name
   const thingName = 'raspberryXX';
   // Instead your pem key and private key
   const thingShadows = thingShadow({
    keyPath: 'cert/private.pem.key',//
    certPath: 'cert/certificate.pem',
    caPath: 'cert/rootCA.cert',
    clientId: 'iot-flower-website'+ Date.parse( new Date()),
        host: 'XXX.iot.cn-north-1.amazonaws.com.cn',
        region: 'cn-north-1',
        baseReconnectTimeMs: 2000,
        keepalive: 600,
        protocol: 'mqtts',
        port: 8883,
        debug: true
   });

   //
   // Operation timeout in milliseconds
   //
   const operationTimeout = 10000;

   var currentTimeout = null;

   //
   // For convenience, use a stack to keep track of the current client 
   // token; in this example app, this should never reach a depth of more 
   // than a single element, but if your application uses multiple thing
   // shadows simultaneously, you'll need some data structure to correlate 
   // client tokens with their respective thing shadows.
   //
   var stack = [];

   function genericOperation(operation, state) {
      var clientToken = thingShadows[operation](thingName, state);

      if (clientToken === null) {
         //
         // The thing shadow operation can't be performed because another one
         // is pending; if no other operation is pending, reschedule it after an 
         // interval which is greater than the thing shadow operation timeout.
         //
         if (currentTimeout !== null) {
            console.log('operation in progress, scheduling retry...');
            currentTimeout = setTimeout(
               function() {
                  genericOperation(operation, state);
               },
               operationTimeout * 2);
         }
      } else {
         //
         // Save the client token so that we know when the operation completes.
         //
         stack.push(clientToken);
      }
   }

   function generateRandomState() {
      var waterValues = {
         threshould: 30
      };

      waterValues.threshould = Math.floor(Math.random() * 600) + 100;

      return {
         state: {
            desired: waterValues
         }
      };
   }

   function mobileAppConnect() {
      thingShadows.register(thingName, {
            ignoreDeltas: false
         },
         function(err, failedTopics) {
            if (isUndefined(err) && isUndefined(failedTopics)) {
               console.log('Mobile thing registered.');
            }
         });
   }

   function deviceConnect() {
      thingShadows.register(thingName, {
            ignoreDeltas: false
         },
         function(err, failedTopics) {
            if (isUndefined(err) && isUndefined(failedTopics)) {
               console.log('Device thing registered.');
               genericOperation('update', generateRandomState());
            }
         });
   }

   // diff testMode === 1
    mobileAppConnect();
   //deviceConnect();

   function handleStatus(thingName, stat, clientToken, stateObject) {
      var expectedClientToken = stack.pop();

      if (expectedClientToken === clientToken) {
         console.log('got \'' + stat + '\' status on: ' + thingName);
      } else {
         console.log('(status) client token mismtach on: ' + thingName);
      }

      
      if (testMode === 2) {
         console.log('updated state to thing shadow');
         //
         // If no other operation is pending, restart it after 10 seconds.
         //
         if (currentTimeout === null) {
            currentTimeout = setTimeout(function() {
               currentTimeout = null;
               //genericOperation('update', generateRandomState());
            }, 10000);
         }
      }
   }

   function handleDelta(thingName, stateObject) {
      if (testMode === 2) {
         console.log('unexpected delta in device mode: ' + thingName);
      } else {
         console.log('delta on: ' + thingName + JSON.stringify(stateObject));
      }
   }

   function handleTimeout(thingName, clientToken) {
      var expectedClientToken = stack.pop();

      if (expectedClientToken === clientToken) {
         console.log('timeout on: ' + thingName);
      } else {
         console.log('(timeout) client token mismtach on: ' + thingName);
      }

      if (testMode === 2) {
         //genericOperation('update', generateRandomState());
      }
   }

   thingShadows.on('connect', function() {
      console.log('connected to AWS IoT');
   });

   thingShadows.on('close', function() {
      console.log('close');
      thingShadows.unregister(thingName);
   });

   thingShadows.on('reconnect', function() {
      console.log('reconnect');
   });

   thingShadows.on('offline', function() {
      //
      // If any timeout is currently pending, cancel it.
      //
      if (currentTimeout !== null) {
         clearTimeout(currentTimeout);
         currentTimeout = null;
      }
      //
      // If any operation is currently underway, cancel it.
      //
      while (stack.length) {
         stack.pop();
      }
      console.log('offline');
   });

   thingShadows.on('error', function(error) {
      console.log('error', error);
   });

   thingShadows.on('message', function(topic, payload) {
      console.log('message', topic, payload.toString());
   });

   thingShadows.on('status', function(thingName, stat, clientToken, stateObject) {
      handleStatus(thingName, stat, clientToken, stateObject);
      
   });

   thingShadows.on('delta', function(thingName, stateObject) {
      handleDelta(thingName, stateObject);
   });

   thingShadows.on('timeout', function(thingName, clientToken) {
      handleTimeout(thingName, clientToken);
   });

   thingShadows.on('foreignStateChange', 
   function(thingName, operation,stateObject) {
       console.log(JSON.stringify(thingShadows.get( thingName )))
      console.log('foreignStateChange ·received delta on '+thingName+': '+
                  JSON.stringify(stateObject));
                  sensordata = JSON.stringify(stateObject.state.reported);
   });

   //thingShadows.subscribe('sensor/data');

function setThreshould(setThreshouldvalue){

    var changeValue = {
        threshould: setThreshouldvalue
     };

     var rechangeValue =  {
        state: {
           desired: changeValue
        }
     };

    genericOperation('update', rechangeValue);
}

var wss = new WebSocketServer({server: server});
wss.on('connection', function (ws) {
  var id = setInterval(function () {
    ws.send(sensordata, function () { /* ignore errors */ });
  }, 2000);

  ws.on('message', function incoming(data) {
    var temp = JSON.parse(data)
    setThreshould(temp.threshould);
  });

  console.log('started client interval');
  ws.on('close', function () {
    console.log('stopping client interval');
    clearInterval(id);
  });
});

//thingShadows.subscribe('sensor/data');

server.on('request', app);

var listenPort = 80;
server.listen(listenPort, function () {
  console.log(`Listening on http://localhost:${listenPort}`);
});