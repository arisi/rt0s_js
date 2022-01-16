#!/usr/bin/env node

const readline = require('readline');
const fs = require("fs")

if (fs.existsSync('./index.js'))
  rt0s = require('./index.js');
else
  rt0s = require('rt0s_js.js');

var mq = new rt0s('ws://mqtt.mq11.net:1993', "", 'demo', "demo");

if (process.argv.length > 2) {
  var args = process.argv.splice(2)
  console.log("argss:", args);
  mq.req(args[0], [args[1], args[2], args[3]], {}, (err, ret) => {
    if (err) {
      console.error("? ", err);
    } else if (ret.error) {
      console.error("? ", ret.error);
    } else {
      console.log("> ", ret);
    }
    process.exit(0)
  })
} else {

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ']',
  });

  rl.on('line', line => {
    var i = 0
    var quote = false
    var s = ""
    for (ch of line) {
      if (ch == '"') {
        quote = !quote
        i++
        continue
      } else if (ch == ' ' && quote) {
        ch = "_"
      }
      s += ch
      i++
    }
    args = s.replace(/\ \ /g, "").split(" ")
    i = 0
    for (a of args) {
      args[i] = a.replace(/_/g, ' ')
      i += 1
    }
    console.log(args);
    mq.req(args[0], [args[1], args[2], args[3]], {}, (err, ret) => {
      if (err) {
        console.error("? ", err);
      } else if (ret.error) {
        console.error("? ", ret.error);
      } else {
        console.log("> ", ret);
      }
      rl.prompt(true)
    })
  });

  rl.prompt(true)
}