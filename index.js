var mqtt = require('mqtt')
const uuid = require('uuid');
const match = require('mqtt-match');

class MQTTapi {

  static stamp() {
    return (new Date).getTime();
  }

  broadcast(path, obj, options = {}) {
    try {
      this._client.publish(`/bc/${this._id}/${path}`, JSON.stringify(obj), options);
    } catch (error) {
      console.error("ERR broadcast:", error);
    }
  }

  publish(path, obj, options = {}) {
    try {
      this._client.publish(path, JSON.stringify(obj), options);
    } catch (error) {
      console.error("ERR publish:", error);
    }
  }

  subscribe(topic, cb) {
    this._client.subscribe(topic, function(err) {
      if (err) {
        console.error("ERR subscribe:", err);
      } else {
        this.sublist[topic] = cb;
      }
    }.bind(this))
  }

  registerAPI(path, descr, args, cb) {
    this.apis[path] = {
      "f": cb,
      descr,
      args,
     };
  }

  req(target, msg, options, cb) {
    var obj = {
      'mid': uuid.v4(),
      'src': this._id,
      'target': target,
      'req': { args: msg },
    };
    this.reqs[obj['mid']] = {
      'obj': obj,
      'cb': cb,
      'done': false,
      'created': MQTTapi.stamp(),
      'sent': MQTTapi.stamp(),
      'tries': 1,
      'retries': "retries" in options ? options.tries : 5,
      'timeout': "timeout" in options ? options.timeout : 3000
    };
    this.publish(`/dn/${target}/${obj['mid']}`, obj);
  }

  end() {
    this._client.end();
    this.change_state(false)
  }

  reconnect() {
    this._client.reconnect();
  }

  constructor(url, id, uid, pw) {
    var ctx = this;
    this._id = id;
    this.connected = false;
    this.connected_reported = false;
    this.sublist = {};
    this.apis = {};
    this.reqs = {};
    this.req_inds = {};
    this.onChangeState = false;

    var _client = mqtt.connect(url, {
      will: {
        topic: `/bc/${this._id}/state`,
        payload: '{"state": "off"}',
        qos: 2,
        retain: true
      },
      reconnectPeriod: 1000,
      clean: true,
      username: uid,
      password: pw,
      clientId: id
    });

    this._client = _client;

    function sleep (time) {
      return new Promise((resolve) => setTimeout(resolve, time));
    }

    var do_subs = () => {

      this.subscribe("/bc/+/+", (topic, msg) => {
        //console.log("bc:", topic, msg);
      })


      this.subscribe(`/up/${this._id}/+`, (topic, obj) => {
        if (obj['mid'] in this.reqs) {
          var r = this.reqs[obj['mid']]
          r.done = true;
          if (r.cb)
            r.cb(null, obj.reply)
        }
      })

      this.reply = (msg, data) => {
        msg['reply'] = data
        this.publish(`/up/${msg['src']}/${msg['mid']}`, msg)
      }

      this.subscribe(`/dn/${this._id}/+`, (topic, msg) => {
        if (msg['req']['args'][0] in this.apis) {
          var api = this.apis[msg['req']['args'][0]];

          var reply = api['f'](msg);
          if (reply == null) {
            return;
          }
          msg['reply'] = reply;
        } else if ("*" in this.apis) {
          var api = this.apis["*"];
          var reply = api['f'](msg);
          if (reply == null) {
            return;
          }
          msg['reply'] = reply;
        } else
          msg['reply'] = {
            "error": `no api '${msg['req']['args'][0]}' at '${this._id}'`
          };
        this.publish(`/up/${msg['src']}/${msg['mid']}`, msg);
        return;
      });
    }

    this._client.on('error', function(err) {
      console.error("err..");
    })

    var change_state = this.change_state = (newstate) => {
      if (this.connected == newstate && newstate==false) {
        console.log("double off -- logout ");
        return;
      }

      if (this.connected == newstate)
        return
      this.connected = newstate
      if (this.onChangeState) {
        if (newstate) {
          sleep(2500).then(() => {
            if (this.connected != this.connected_reported) {
              this.onChangeState(this.connected)
              this.connected_reported = this.connected
            }
          })
        }
        else
          if (this.connected != this.connected_reported) {
            this.onChangeState(this.connected)
            this.connected_reported = this.connected
          }
      }
    }

    this._client.on('disconnect', function(err) {
      console.error("disconnected");
      change_state(false);
    })
    this._client.on('offline', function(err) {
      console.error("offline");
      change_state(false);
    })

    this._client.on('connect', function() {
      change_state(true);
      ctx.broadcast("state", { "state": "online", "stamp": MQTTapi.stamp() }, { retain: true, qos: 2 });
      do_subs()
    })

    _client.on('message', function(topic, msg) {
      Object.keys(this.req_inds).forEach(ind => {
        if (match(this.req_inds[ind]['path'], topic)) {
          var obj = JSON.parse(msg.toString());
          var p = topic.split("/");
          obj.device =  p[2]
          obj.indication = p[3]
          obj.received = MQTTapi.stamp();
          this.req_inds[ind]['cb'](this.req_inds[ind], obj);
        }
      });
      Object.keys(this.sublist).forEach(sub => {
        if (match(sub, topic)) {
          try {
            var obj = JSON.parse(msg.toString())
            this.sublist[sub](topic, obj);
          } catch (error) {
            console.error("got bad obj", msg.toString(), error);
          }
        }
      });
    }.bind(this))

    this.send_ind = (path, obj, options = {}) => {
      try {
        this.client.publish(`/ind/${this._cid}/${path}`, JSON.stringify(obj), options);
      } catch (error) {
        console.error('ERR broadcast:', error);
      }
    };

    this.req_ind = (src, topic, cb) => {
      var key = src+"_"+topic
      this.req_inds[key] = {
        'src': src,
        'topic': topic,
        'key': key,
        'path': "/ind/"+src+"/"+topic,
        'cb': cb,
      }
      console.log("req_ind subs:", key, this.req_inds[key]);
      this._client.subscribe(this.req_inds[key]['path'])
    }

    this.registerAPI("ping", "Ping", [], (msg) => {
      return { "pong": true };
    })

    this.registerAPI("api", "Get API", [], (msg) => {
      var ret=[]
      console.log("apis",this.apis);
      for (var c of Object.keys(this.apis)) {
        ret.push({
          cmd: c,
          descr: this.apis[c].descr,
          args: this.apis[c].args,
        })
      }
      return ret;
    })

    setInterval(() => {
      for (var k in this.reqs) {
        var r = this.reqs[k]
        const now = MQTTapi.stamp()
        if (r.done)
          delete this.reqs[k]
        else if (now > r.sent + r.timeout) {
          if (r.retries > r.tries) {
            r.tries += 1;
            r.obj.resend = r.tries
            this.publish(`/dn/${r.obj.target}/${r.obj.mid}`, r.obj);
            r.sent = now;
          } else {
            if (r.cb)
              r.cb("timeout")
            r.done = true;
          }
        }
      }
    }, 100);
  }
}

module.exports = MQTTapi;
