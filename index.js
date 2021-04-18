var mqtt = require('mqtt')

const match = require('mqtt-match');

class MQTTapi {
  sublist = {};
  apis = {};

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
      console.log(this.sublist);
      
    }.bind(this))
  }

  registerAPI(path, cb) {
    this.apis[path] = {"f": cb};
  }
  
  constructor(url, id) {
    var ctx = this;
    this._id = id;

    var _client = mqtt.connect(url, {
      will: {
      topic: `/bc/${this._id}/state`,
      payload: '{"state": "off"}',
      qos: 2,
      retain: true
      },
    });
    
    this._client = _client;
    this._client.on('connect', function () {
      ctx.broadcast("state", { "state": "online", "stamp": MQTTapi.stamp() }, { retain: true,qos:2 });
    })
       
    _client.on('message', function (topic, msg) {
      Object.keys(this.sublist).forEach(sub => {
        if (match(sub, topic)) {
          try {
            var obj=JSON.parse(msg.toString())
            this.sublist[sub](topic,obj);
          } catch (error) {
            console.error("got bad obj",msg.toString(),error);
          }
        }
      });
    }.bind(this))

    this.subscribe("/bc/+/+", (topic, msg) => {
      console.log("bc:", topic, msg);
    })

    this.subscribe(`/dn/${this._id}/#`, (topic, msg) => {
      if (msg['req']['args'][0] in this.apis) {
        var api = this.apis[msg['req']['args'][0]];
        
        var reply = api['f'](msg);
        if (reply == null) {
          console.log("api will reply later");
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
          "error": "no api '${msg['req']['args'][0]}' at '${this._id}'"
        };
      this.publish(`/up/${msg['src']}/${msg['mid']}`, msg);
      return;
    });

    this.registerAPI("ping", (msg) => { 
      return {"pong": true};
    })
  }
}

module.exports = MQTTapi;
