var rt0s = require('./index.js');

mq = new rt0s('mqtt://mqtt.rt0s.com', 'libtester', "demo", "demo");

mq.registerAPI("pung", (msg) => { 
  console.log("got pung -- oing numnet");
  mq.req("numnet", ["ping"], {} , (err,ret) => { 
    console.log("got reply",err,ret);
  })
  return {"pung": true};
})

mq.onChangeState = (s) => {
  console.log("yep state", s);
  if (s) {
    //sleep(2500).then(() => {
      console.log("TESTIN");
      // mq.req("numnet", ["get","0400503772","x"], {}, (err,ret) => { 
      //   console.log("got reply",err,ret);
      // })
      mq.req("numnet", ["ping"], {} , (err,ret) => { 
        console.log("got reply",err,ret);
      //})
    });
    
  }
} 
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

