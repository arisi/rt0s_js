var rt0s = require('./index.js');

mq = new rt0s('mqtt://mqtt.rt0s.com', 'libtester', "demo", "demo");

mq.registerAPI("pung", (msg) => { 
  return {"pung": true};
})

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

sleep(500).then(() => {
  mq.req("numnet", ["ping"], {}, (err,ret) => { 
    console.log("got reply",err,ret);
  })
  mq.req("numnetx", ["ping"], {} , (err,ret) => { 
    console.log("got reply",err,ret);
  })
});
