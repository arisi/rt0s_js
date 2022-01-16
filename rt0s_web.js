sublist = {};
apis = {};
reqs = {};
var sreqs = {}

connected = false;
connected_reported = false;
onChangeState = false;
client = null;
var current_user = '';
var current_user_stamp = 0;

dates = (d) => {
  now = stamp()
  if (!d || d == 0)
    return ""
  //dd = new Date(d).toISOString()
  oset = (new Date).getTimezoneOffset();
  dd = new Date(d - oset * 60 * 1000).toISOString()
  if (now - d < 24 * 60 * 60 * 1000)
    return dd.slice(11, 19);
  return dd.slice(0, 19);
}

timed = (d) => {
  var dd = d || 0
  if (dd < 60 * 60)
    return sprintf("%d:%02d", dd / 60, dd % 60)
  else
    return sprintf("%d:%02d:%02d", dd / 3600, (dd / 60) % 60, dd % 60)
}

visitorId = "?"

function initFingerprintJS() {
  // Initialize an agent at application startup.

  // Get the visitor identifier when you need it.
  FingerprintJS.load()
    .then(fp => fp.get())
    .then(result => {
      // This is the visitor identifier:
      const visitorId = result.visitorId
      console.log("id", visitorId)
      window.visitorId = visitorId
    })
}

var rt0s_init = async (url,app,uid,pw) => {
  _url = url
  _app = app
  _uid = uid
  _pw = pw

  FingerprintJS.load()
    .then(fp => fp.get())
    .then(result => {
      // This is the visitor identifier:
      visitorId = result.visitorId
      _cid = _app + ":" + visitorId + "_" + (stamp().toString())
      console.log("id", visitorId)
      do_connect(_uid, _pw)
      ready()
    })
}

var hide_id = (id) => {
  var e = document.getElementById(id)
  if (e) {
    e.style.display = "none"
  }
}

var show_id = (id, style) => {
  var e = document.getElementById(id)
  if (e) {
    e.style.display = style ? style : "block"
  }
}

var $ = (sel) => {
  switch (sel.substring(0, 1)) {
    case '#':
      return document.getElementById(sel.substring(1))
  }
  return ""
}


var get_file = async (fn) => {
  return new Promise((res) => {
    fetch(fn)
      .then((resp) => {
        return resp.text()
      })
      .then(function (data) {
        res(data)
      })
  });
}

uuidv4x = () => {
  var result, i, j;
  result = '';
  for (j = 0; j < 16; j++) {
    if (j == 8 || j == 12 || j == 16 || j == 20) result = result + '-';
    i = Math.floor(Math.random() * 16).toString(16).toUpperCase();
    result = result + i;
  }
  return result;
};

uuidv4 = () => {
  var result, i, j;
  result = '';
  for (j = 0; j < 32; j++) {
    if (j == 8 || j == 12 || j == 16 || j == 20) result = result + '-';
    i = Math.floor(Math.random() * 16).toString(16).toUpperCase();
    result = result + i;
  }
  return result;
};

sleep = time => {
  return new Promise(resolve => setTimeout(resolve, time));
};

stamp = () => {
  return new Date().getTime();
};

match = (filter, topic) => {
  const filterArray = filter.split('/');
  const length = filterArray.length;
  const topicArray = topic.split('/');

  for (var i = 0; i < length; ++i) {
    var left = filterArray[i];
    var right = topicArray[i];
    if (left === '#') return topicArray.length >= length - 1;
    if (left !== '+' && left !== right) return false;
  }

  return length === topicArray.length;
};

var change_state = (change_state = newstate => {
  //console.log('yep -- change_state', connected, newstate);
  if (connected == newstate && newstate == false) {
    console.log('double off -- logout ');
    client.end(true, () => {
      console.log('ended');
      do_connect('anon', 'anon');
    });
    delete client;
    client = {};
    return;
  }
  if (newstate && current_user_stamp == 0)
    current_user_stamp = stamp()

  if (connected == newstate) return;
  connected = newstate;
  if (onChangeState) {
    if (newstate) {
      sleep(2500).then(() => {
        if (connected != connected_reported) {
          onChangeState(connected);
          connected_reported = connected;
        }
      });
    } else if (connected != connected_reported) {
      onChangeState(connected);
      connected_reported = connected;
    }
  }
});

var end = () => {
  client.end(true);
  change_state(false);
};

var reconnect = () => {
  client.reconnect();
};

var broadcast = (path, obj, options = {}) => {
  try {
    client.publish(`/bc/${_cid}/${path}`, JSON.stringify(obj), options);
  } catch (error) {
    console.error('ERR broadcast:', error);
  }
};

var publish = (path, obj, options = {}) => {
  try {
    client.publish(path, JSON.stringify(obj), options);
  } catch (error) {
    console.error('ERR publish:', error);
  }
};

var subscribe = (topic, cb) => {
  client.subscribe(
    topic,
    function (err) {
      if (err) {
        console.error('ERR subscribe:', err);
      } else {
        sublist[topic] = cb;
      }
    }.bind(this)
  );
};

var registerAPI = (path, descr, args, cb)  => {
  apis[path] = { 
    "f": cb,
    descr,
    args,
   };
}

var req_seq = 0

var req = (target, msg, options, cb, logger, stream) => {
  if ((current_user == "anon" || current_user == "") && target != "manager") {
    console.log("no reqs for anon", target);
    cb(null, { results: [] })
    return
  }
  var obj = {
    mid: uuidv4(),
    src: _cid,
    target: target,
    req: { args: msg },
    token,
  };
  if (stream != undefined) {
    obj.stream = msg[0] + "_stream"
    console.log("have stream", obj.stream);
    sreqs[obj.stream] = stream
  }
  req_seq += 1
  reqs[obj['mid']] = {
    obj: obj,
    logger,
    cb: cb,
    // cb: (err, ret) => { 
    //   if (err)
    //     console.log("req cb wrapper ERR:",err);
    //   else if ("error" in ret) {
    //     console.log('wrapper got error from mysql', ret.error)
    //   }
    //   cb(err,ret); 
    // },
    done: false,
    created: stamp(),
    sent: stamp(),
    tries: 1,
    retries: 'retries' in options ? options.tries : 3,
    timeout: 'timeout' in options ? options.timeout : 3000,
    req_seq,
  }
  if (reqs[obj['mid']].logger)
    reqs[obj['mid']].logger(`S${reqs[obj['mid']].req_seq}:1/${reqs[obj['mid']].retries}:${target}:${JSON.stringify(obj.req.args)}`, 'white')
  publish(`/dn/${target}/${obj['mid']}`, obj);
};

var do_subs = () => {
  if (current_user != "anon") {
    subscribe('/bc/+/+', (topic, msg) => {
      if ('onBroadcast' in window) onBroadcast(topic, msg);
      //console.log("bc:", topic, msg);
    });
  } else {
    subscribe('/bc/broker/+', (topic, msg) => {
      if ('onBroadcast' in window) onBroadcast(topic, msg);
      //console.log("bc:", topic, msg);
    });

  }

  subscribe(`/up/${_cid}/+`, (topic, obj) => {
    if (obj['mid'] in reqs) {
      var r = reqs[obj['mid']];
      if (r.logger)
        r.logger(`R${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(obj.reply)}`, 'lightgreen')

      r.done = true;
      if (r.cb) r.cb(null, obj.reply);
    } else {
      hit = topic.match(/\/up\/(.+)\/(.+)/)
      if (hit) {
        if (hit[2] in sreqs) {
          sreqs[hit[2]](hit[2], obj)
        }
      }
    }
  });

  subscribe(`/dn/${_cid}/+`, (topic, msg) => {
    if (msg['req']['args'][0] in apis) {
      var api = apis[msg['req']['args'][0]];
      var reply = api['f'](msg);

      if (reply == null) {
        console.log('api will reply later');
        return;
      }
      msg['reply'] = reply;
    } else if ('*' in apis) {
      var api = apis['*'];
      var reply = api['f'](msg);

      if (reply == null) {
        return;
      }
      msg['reply'] = reply;
    } else
      msg['reply'] = {
        error: `no api '${msg['req']['args'][0]}'`,
      };
    publish(`/up/${msg['src']}/${msg['mid']}`, msg);
    return;
  });
};

var do_connect = (_uid, _pw) => {
  current_user = _uid
  current_user_stamp = 0
  if (connected)
    end()
  // try {
  //   end()
  // } catch (error) {
  //   console.log("end errored",error);
  // }
  client = mqtt.connect(_url, {
    reconnectPeriod: 10000,
    clean: true,
    username: _uid,
    password: _pw,
    clientId: _cid,
  });
  if (onChangeState) {
    onChangeState(connected);
  }

  client.on('connect', function () {
    console.log('connected!', current_user);
    change_state(true);
    if (current_user != "anon")
      broadcast("state", { "state": "online", "stamp": stamp() }, { retain: false, qos: 2 });
    do_subs();
  });

  client.on('disconnect', function (err) {
    console.error('disconnected');
    change_state(false);
  });

  client.on('offline', function (err) {
    console.error('offline');
    change_state(false);
  });

  client.on(
    'message',
    function (topic, msg) {
      //console.log("got msg",topic,msg.toString());
      Object.keys(sublist).forEach(sub => {
        if (match(sub, topic)) {
          try {
            var obj = JSON.parse(msg.toString());
            sublist[sub](topic, obj);
          } catch (error) {
            console.error('bad handler', topic, msg.toString(), error);
          }
        }
      });
    }.bind(this)
  );
};

registerAPI('ping', "pings", [], msg => {
  console.log('WE WERE PINGED - AND PONGED BACK');
  return { pong: true };
});

registerAPI("api", "Get API", [], (msg) => {
  var ret=[]
  for (var c of Object.keys(apis)) {
    ret.push({
      cmd: c,
      descr: apis[c].descr,
      args: apis[c].args,
    })
  }
  return ret;
})


setInterval(() => {
  if ((current_user == "anon" || current_user == "")) {
    return;
  }
  for (var k in reqs) {
    var r = reqs[k];
    const now = stamp();
    if (r.done) delete reqs[k];
    else if (now > r.sent + r.timeout * r.tries) {
      if (r.retries > r.tries) {
        r.tries += 1;
        r.obj.resend = r.tries;
        if (r.logger)
          r.logger(`R${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(r.obj.req.args)}`, 'yellow')

        publish(`/dn/${r.obj.target}/${r.obj.mid}`, r.obj);
        r.sent = now;
      } else {
        if (r.logger)
          r.logger(`T${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(r.obj.req.args)}`, 'red')
        if (r.cb) r.cb('timeout');
        r.done = true;
      }
    }
  }
}, 100);

console.log('rt0s OK');
