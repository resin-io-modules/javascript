var NOW                     = 1
,   READY                   = false
,   READY_BUFFER            = []
,   PRESENCE_SUFFIX         = '-pnpres'
,   DEF_WINDOWING           = 10     // MILLISECONDS.
,   SUBSCRIBE_TIMEOUT       = 310000    // MILLISECONDS.
,   NON_SUBSCRIBE_TIMEOUT   = 20000      // MILLISECONDS
,   DEF_KEEPALIVE           = 60000     // MILLISECONDS (FOR TIMESYNC).
,   URLBIT                  = '/'
,   PARAMSBIT               = '&'
,   PRESENCE_HB_THRESHOLD   = 5000
,   PRESENCE_HB_DEFAULT     = 30000
,   SDK_VER                 = VERSION
,   REPL                    = /{([\w\-]+)}/g;



var  CONNECTION_STATES     =   {
    'EXPECTED_DISCONNECTED'     : 1,
    'UNEXPECTED_DISCONNECTED'   : 2,
    'CONNECTED'                 : 3 
};
var CONNECTION_STATE_MACHINE = {
    1 : {
        0 : {
            'state'     : CONNECTION_STATES['EXPECTED_DISCONNECTED'],
            'callback'  : 0
        },
        1 : {
            'state'     : CONNECTION_STATES['CONNECTED'],
            'callback'  : 'connect'
        }
    },
    2 : {
        0 : {
            'state'     : CONNECTION_STATES['UNEXPECTED_DISCONNECTED'],
            'callback'  : 0
        },
        1 : {
            'state'     : CONNECTION_STATES['CONNECTED'],
            'callback'  : 'reconnect'
        }
    },
    3 : {
        0 : {
            'state'     : CONNECTION_STATES['UNEXPECTED_DISCONNECTED'],
            'callback'  : 'disconnect'
        },
        1 : {
            'state'     : CONNECTION_STATES['CONNECTED'],
            'callback'  : 0
        }
    }

};


/**
 * UTILITIES
 */
function unique() { return'x'+ ++NOW+''+(+new Date) }
function rnow()   { return+new Date }

/**
 * NEXTORIGIN
 * ==========
 * var next_origin = nextorigin();
 */
var nextorigin_cache_busting = (function() {
    var max = 20
    ,   ori = Math.floor(Math.random() * max);
    return function( origin, failover ) {
        return origin.indexOf('pubsub.') > 0
            && origin.replace(
             'pubsub', 'ps' + (
                failover ? generate_uuid().split('-')[0] :
                (++ori < max? ori : ori=1)
            ) ) || origin;
    }
})();

/**
 * Build Url
 * =======
 *
 */
function build_url( url_components, url_params ) {
    var url    = url_components.join(URLBIT)
    ,   params = [];

    if (!url_params) return url;

    each( url_params, function( key, value ) {
        var value_str = (typeof value == 'object')?JSON['stringify'](value):value;
        (typeof value != 'undefined' &&
            value != null && encode(value_str).length > 0
        ) && params.push(key + "=" + encode(value_str));
    } );

    url += "?" + params.join(PARAMSBIT);
    return url;
}

/**
 * UPDATER
 * =======
 * var timestamp = unique();
 */
function updater( fun, rate ) {
    var timeout
    ,   last   = 0
    ,   runnit = function() {
        if (last + rate > rnow()) {
            clearTimeout(timeout);
            timeout = setTimeout( runnit, rate );
        }
        else {
            last = rnow();
            fun();
        }
    };

    return runnit;
}

/**
 * GREP
 * ====
 * var list = grep( [1,2,3], function(item) { return item % 2 } )
 */
function grep( list, fun ) {
    var fin = [];
    each( list || [], function(l) { fun(l) && fin.push(l) } );
    return fin
}

/**
 * SUPPLANT
 * ========
 * var text = supplant( 'Hello {name}!', { name : 'John' } )
 */
function supplant( str, values ) {
    return str.replace( REPL, function( _, match ) {
        return values[match] || _
    } );
}

/**
 * timeout
 * =======
 * timeout( function(){}, 100 );
 */
function timeout( fun, wait ) {
    return setTimeout( fun, wait );
}

/**
 * uuid
 * ====
 * var my_uuid = generate_uuid();
 */

function generate_uuid(callback) {
    var u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
    function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    if (callback) callback(u);
    return u;
}

function isArray(arg) {
  return !!arg && typeof arg !== 'string' && (Array.isArray && Array.isArray(arg) || typeof(arg.length) === "number")
  //return !!arg && (Array.isArray && Array.isArray(arg) || typeof(arg.length) === "number")
}

/**
 * EACH
 * ====
 * each( [1,2,3], function(item) { } )
 */
function each( o, f) {
    if ( !o || !f ) return;

    if ( isArray(o) )
        for ( var i = 0, l = o.length; i < l; )
            f.call( o[i], o[i], i++ );
    else
        for ( var i in o )
            o.hasOwnProperty    &&
            o.hasOwnProperty(i) &&
            f.call( o[i], i, o[i] );
}

/**
 * MAP
 * ===
 * var list = map( [1,2,3], function(item) { return item + 1 } )
 */
function map( list, fun ) {
    var fin = [];
    each( list || [], function( k, v ) { fin.push(fun( k, v )) } );
    return fin;
}


function pam_encode(str) {
  return encodeURIComponent(str).replace(/[!'()*~]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

/**
 * ENCODE
 * ======
 * var encoded_data = encode('path');
 */
function encode(path) { return encodeURIComponent(path) }

/**
 * Generate Subscription Channel List
 * ==================================
 * generate_channel_list(channels_object);
 */
function generate_channel_list(channels, nopresence) {
    var list = [];
    each( channels, function( channel, status ) {
        if (nopresence) {
            if(channel.search('-pnpres') < 0) {
                if (status.subscribed) list.push(channel);
            }
        } else {
            if (status.subscribed) list.push(channel);
        }
    });
    return list.sort();
}

/**
 * Generate Subscription Channel Groups List
 * ==================================
 * generate_channel_group_list(channels_groups object);
 */
function generate_channel_group_list(channel_groups, nopresence) {
    var list = [];
    each(channel_groups, function( channel_group, status ) {
        if (nopresence) {
            if(channel_group.search('-pnpres') < 0) {
                if (status.subscribed) list.push(channel_group);
            }
        } else {
            if (status.subscribed) list.push(channel_group);
        }
    });
    return list.sort();
}

// PUBNUB READY TO CONNECT
function ready() { timeout( function() {
    if (READY) return;
    READY = 1;
    each( READY_BUFFER, function(connect) { connect() } );
}, 1000 ); }

function PNmessage(args) {
    msg = args || {'apns' : {}},
    msg['getPubnubMessage'] = function() {
        var m = {};

        if (Object.keys(msg['apns']).length) {
            m['pn_apns'] = {
                    'aps' : {
                        'alert' : msg['apns']['alert'] ,
                        'badge' : msg['apns']['badge']
                    }
            }
            for (var k in msg['apns']) {
                m['pn_apns'][k] = msg['apns'][k];
            }
            var exclude1 = ['badge','alert'];
            for (var k in exclude1) {
                delete m['pn_apns'][exclude1[k]];
            }
        }



        if (msg['gcm']) {
            m['pn_gcm'] = {
                'data' : msg['gcm']
            }
        }

        for (var k in msg) {
            m[k] = msg[k];
        }
        var exclude = ['apns','gcm','publish', 'channel','callback','error'];
        for (var k in exclude) {
            delete m[exclude[k]];
        }

        return m;
    };
    msg['publish'] = function() {

        var m = msg.getPubnubMessage();

        if (msg['pubnub'] && msg['channel']) {
            msg['pubnub'].publish({
                'message' : m,
                'channel' : msg['channel'],
                'callback' : msg['callback'],
                'error' : msg['error']
            })
        }
    };
    return msg;
}

function isNullOrUndefined(r) {
    return ( r == null || typeof r === 'undefined');
}

function add_result_envelope(r) {
    var result = {};
    if (!isNullOrUndefined(r['operation']))  result['operation']     = r['operation'];
    if (!isNullOrUndefined(r['connection'])) result['connection']    = r['connection'];
    if (!isNullOrUndefined(r['request']))    result['request']       = r['request'];
    if (!isNullOrUndefined(r['code']))       result['code']          = r['code'];
    if (!isNullOrUndefined(r['data']))       result['data']          = r['data'];
    return result;
}

function PN_API(setup) {
    var SUB_WINDOWING =  +setup['windowing']   || DEF_WINDOWING
    ,   SUB_TIMEOUT   = (+setup['subscribe_timeout']     || SUBSCRIBE_TIMEOUT)
    ,   NON_SUBSCRIBE_TIMEOUT = (+setup['non_subscribe_timeout']     || NON_SUBSCRIBE_TIMEOUT)
    ,   KEEPALIVE     = (+setup['keepalive']   || DEF_KEEPALIVE)
    ,   TIME_CHECK    = setup['timecheck']     || 0
    ,   NOLEAVE       = setup['noleave']       || 0
    ,   PUBLISH_KEY   = setup['publish_key']   || 'demo'
    ,   SUBSCRIBE_KEY = setup['subscribe_key'] || 'demo'
    ,   AUTH_KEY      = setup['auth_key']      || ''
    ,   SECRET_KEY    = setup['secret_key']    || ''
    ,   hmac_SHA256   = setup['hmac_SHA256']
    ,   SSL           = setup['ssl']            ? 's' : ''
    ,   ORIGIN        = 'http'+SSL+'://'+(setup['origin']||'pubsub.pubnub.com')
    ,   ORIGINS       = setup['origins'] // || [ORIGIN.split('://')[1]]
    ,   CACHE_BUSTING = false
    ,   CONNECT       = function(){}
    ,   PUB_QUEUE     = []
    ,   CLOAK         = true
    ,   TIME_DRIFT    = 0
    ,   SUB_CALLBACK  = 0
    ,   SUB_CHANNEL   = 0
    ,   SUB_RECEIVER  = 0
    ,   SUB_RESTORE   = setup['restore'] || 0
    ,   SUB_BUFF_WAIT = 0
    ,   TIMETOKEN     = 0
    ,   RESUMED       = false
    ,   CHANNELS      = {}
    ,   CHANNEL_GROUPS       = {}
    ,   SUB_ERROR     = function(){}
    ,   STATE         = {}
    ,   PRESENCE_HB_TIMEOUT  = null
    ,   PRESENCE_HB          = validate_presence_heartbeat(
        setup['heartbeat'] || setup['pnexpires'] || 0, setup['error']
    )
    ,   PRESENCE_HB_INTERVAL = setup['heartbeat_interval'] || (PRESENCE_HB / 2) -1
    ,   PRESENCE_HB_RUNNING  = false
    ,   ORIGIN_HB_TIMEOUT     = null
    ,   ORIGIN_HB_INTERVAL    = setup['origin_heartbeat_interval'] || 60000
    ,   ORIGIN_HB_MAX_RETRIES = setup['origin_heartbeat_max_retries'] || 2
    ,   ORIGIN_HB_INTERVAL_AFTER_FAILURE = setup['origin_heartbeat_interval_after_failure'] || 10000
    ,   ORIGIN_HB_RUNNING     = false
    ,   OPTIMAL_ORIGIN_CHECK_HB_RUNNING = false
    ,   OPTIMAL_ORIGIN_CHECK_HB_TIMEOUT = null
    ,   OPTIMAL_ORIGIN_CHECK_HB_INTERVAL = setup['optimal_origin_check_heartbeat_interval'] || 15000
    ,   NO_WAIT_FOR_PENDING  = setup['no_wait_for_pending']
    ,   COMPATIBLE_35 = setup['compatible_3.5']  || false
    ,   xdr           = setup['xdr']
    ,   params        = setup['params'] || {}
    ,   error         = setup['error']      || function() {}
    ,   _is_online    = setup['_is_online'] || function() { return 1 }
    ,   jsonp_cb      = setup['jsonp_cb']   || function() { return 0 }
    ,   db            = setup['db']         || {'get': function(){}, 'set': function(){}}
    ,   CIPHER_KEY    = setup['cipher_key']
    ,   result_cb     = setup['result'] || function(){}
    ,   status_cb     = setup['status'] || function(){}
    ,   origin_hb_callback       = setup['origin_heartbeat_callback']
    ,   origin_hb_error_callback = setup['origin_heartbeat_error_callback'] 
    ,   UUID          = setup['uuid'] || ( !setup['unique_uuid'] && db && db['get'](SUBSCRIBE_KEY+'uuid') || '')
    ,   USE_INSTANCEID = setup['instance_id'] || false
    ,   INSTANCEID     = ''
    ,   _poll_timer
    ,   _poll_timer2;

    if (PRESENCE_HB === 2) PRESENCE_HB_INTERVAL = 1;

    var crypto_obj    = setup['crypto_obj'] ||
        {
            'encrypt' : function(a,key){ return a},
            'decrypt' : function(b,key){return b}
        };

    var cur = -1;
    var retry_no = 1;

    var nextorigin_ha = function(origins , current) {
            if (!origins || !origins[0]) return nextorigin_cache_busting(origins);
            var len = origins.length;
            return 'http'+SSL+'://' + ( origins[current % origins.length]  || origins[0] || 'pubsub.pubnub.com');
        };

    var nextorigin = function(domain,failover) {
        if (ORIGINS)
            return nextorigin_ha(ORIGINS , failover);
        else 
            return nextorigin_cache_busting(domain, failover);
    };

    var STD_ORIGIN    = nextorigin(ORIGINS || ORIGIN, ++cur)
    ,   SUB_ORIGIN    = nextorigin(ORIGINS || ORIGIN, cur);

    function _get_url_params(data) {
        if (!data) data = {};
        each( params , function( key, value ) {
            if (!(key in data)) data[key] = value;
        });
        return data;
    }

    function _object_to_key_list(o) {
        var l = []
        each( o , function( key, value ) {
            l.push(key);
        });
        return l;
    }
    function _object_to_key_list_sorted(o) {
        return _object_to_key_list(o).sort();
    }

    function _get_pam_sign_input_from_params(params) {
        var si = "";
        var l = _object_to_key_list_sorted(params);

        for (var i in l) {
            var k = l[i]
            si += k + "=" + pam_encode(params[k]) ;
            if (i != l.length - 1) si += "&"
        }
        return si;
    }

    function validate_presence_heartbeat(heartbeat, cur_heartbeat, error) {
        var err = false;

        if (typeof heartbeat === 'undefined') {
            return cur_heartbeat;
        }

        if (typeof heartbeat === 'number') {
            if (heartbeat > PRESENCE_HB_THRESHOLD || heartbeat == 0)
                err = false;
            else
                err = true;
        } else if(typeof heartbeat === 'boolean'){
            if (!heartbeat) {
                return 0;
            } else {
                return PRESENCE_HB_DEFAULT;
            }
        } else {
            err = true;
        }

        if (err) {
            error && error("Presence Heartbeat value invalid. Valid range ( x > " + PRESENCE_HB_THRESHOLD + " or x = 0). Current Value : " + (cur_heartbeat || PRESENCE_HB_THRESHOLD));
            return cur_heartbeat || PRESENCE_HB_THRESHOLD;
        } else return heartbeat;
    }

    function encrypt(input, key) {
        return crypto_obj['encrypt'](input, key || CIPHER_KEY) || input;
    }
    function decrypt(input, key) {
        return crypto_obj['decrypt'](input, key || CIPHER_KEY) ||
               crypto_obj['decrypt'](input, CIPHER_KEY) ||
               input;
    }

    function error_common(message, callback) {
        callback && callback({ 'error' : message || "error occurred"});
        error && error(message);
    }
    function _presence_heartbeat() {

        clearTimeout(PRESENCE_HB_TIMEOUT);

        if (!PRESENCE_HB_INTERVAL || PRESENCE_HB_INTERVAL >= 500 ||
            PRESENCE_HB_INTERVAL < 1 ||
            (!generate_channel_list(CHANNELS,true).length  && !generate_channel_group_list(CHANNEL_GROUPS, true).length ) )
        {
            PRESENCE_HB_RUNNING = false;
            return;
        }

        PRESENCE_HB_RUNNING = true;
        SELF['presence_heartbeat']({
            'callback' : function(r) {
                PRESENCE_HB_TIMEOUT = timeout( _presence_heartbeat, (PRESENCE_HB_INTERVAL));
            },
            'error' : function(e) {
                error && error("Presence Heartbeat unable to reach Pubnub servers." + JSON.stringify(e));
                PRESENCE_HB_TIMEOUT = timeout( _presence_heartbeat, (PRESENCE_HB_INTERVAL));
            }
        });
    }

    function start_presence_heartbeat() {
        !PRESENCE_HB_RUNNING && _presence_heartbeat();
    }

    function _reset(i,message) {
        var old_origin = SUB_ORIGIN;
        var counter = (typeof i !== 'undefined')?i:++cur;
        cur = counter;
        STD_ORIGIN = nextorigin(ORIGINS || ORIGIN, counter);
        SUB_ORIGIN = nextorigin(ORIGINS || ORIGIN, counter);
        origin_hb_error_callback && origin_hb_error_callback({ 'message' : 'switching origin', "old_origin" : old_origin, "new_origin" : SUB_ORIGIN});
        _reset_offline( 1, { "message" : message || "Heartbeat Failed. Changing Origin", "old_origin" : old_origin,  "new_origin" : SUB_ORIGIN});

        each_channel(function(channel){
            // Disconnect
            if (channel.connected && !channel.disconnected) {
                channel.disconnected = 1;
                channel.disconnect(channel.name);
            }
        });
        retry_no = 1;
        CONNECT();
    }

    function _send_optimal_check_heartbeat(i) {
        SELF['origin_heartbeat']({
            'origin'   : ORIGINS[i],
            'callback' : function(r) {
                if (i < cur % ORIGINS.length) _reset(i, "Optimal Check success for " + ORIGINS[i]);
            }
        });
    }

    function _optimal_origin_check_heartbeat(reset) {

        if (!ORIGINS) return;

        clearTimeout(OPTIMAL_ORIGIN_CHECK_HB_TIMEOUT);

        if (!OPTIMAL_ORIGIN_CHECK_HB_INTERVAL || !generate_channel_list(CHANNELS).length){
            ORIGIN_HB_RUNNING = false;
            return;
        }

        OPTIMAL_ORIGIN_CHECK_HB_RUNNING = true;

        for (var i = 0 ; i < ( cur % ORIGINS.length ) ; i++) {
            _send_optimal_check_heartbeat(i);
        }
        OPTIMAL_ORIGIN_CHECK_HB_TIMEOUT = timeout( _optimal_origin_check_heartbeat, (OPTIMAL_ORIGIN_CHECK_HB_INTERVAL) );
    }

    function _origin_heartbeat(reset) {

        clearTimeout(ORIGIN_HB_TIMEOUT);

        if (!ORIGIN_HB_INTERVAL || !generate_channel_list(CHANNELS).length){
            ORIGIN_HB_RUNNING = false;
            return;
        }

        ORIGIN_HB_RUNNING = true;
        SELF['origin_heartbeat']({
            'callback' : function(r) {
                origin_hb_callback && origin_hb_callback({'timetoken' : r, 'origin' : SUB_ORIGIN, 'heartbeat_retry_number' : retry_no});
                retry_no = 1;
                ORIGIN_HB_TIMEOUT = timeout( _origin_heartbeat, (ORIGIN_HB_INTERVAL) );
            },
            'error' : function(e) {
                origin_hb_error_callback && 
                origin_hb_error_callback({"origin" : SUB_ORIGIN, 'heartbeat_retry_number' : retry_no});

                !origin_hb_error_callback && 
                error && 
                error({"origin" : SUB_ORIGIN, 'heartbeat_retry_number' : retry_no});

                if (reset || ORIGIN_HB_MAX_RETRIES === 1) {
                    _reset();
                    retry_no = 1;
                    ORIGIN_HB_TIMEOUT = timeout( _origin_heartbeat, ORIGIN_HB_INTERVAL  );
                } else {
                    retry_no++;
                    if (retry_no < ORIGIN_HB_MAX_RETRIES) {
                        ORIGIN_HB_TIMEOUT = timeout( _origin_heartbeat, ORIGIN_HB_INTERVAL_AFTER_FAILURE  );
                    } else {
                        ORIGIN_HB_TIMEOUT = timeout(function() { _origin_heartbeat(1) },ORIGIN_HB_INTERVAL_AFTER_FAILURE  );
                    }
                }
            }
        });
    }

    function start_origin_heartbeat() {
        !ORIGIN_HB_RUNNING && _origin_heartbeat();
    }

    function start_optimal_origin_check_heartbeat() {
        !OPTIMAL_ORIGIN_CHECK_HB_RUNNING && _optimal_origin_check_heartbeat();
    }

    function publish(next) {

        if (NO_WAIT_FOR_PENDING) {
            if (!PUB_QUEUE.length) return;
        } else {
            if (next) PUB_QUEUE.sending = 0;
            if ( PUB_QUEUE.sending || !PUB_QUEUE.length ) return;
            PUB_QUEUE.sending = 1;
        }

        xdr(PUB_QUEUE.shift());
    }
    function each_channel_group(callback) {
        var count = 0;

        each( generate_channel_group_list(CHANNEL_GROUPS), function(channel_group) {
            var chang = CHANNEL_GROUPS[channel_group];

            if (!chang) return;

            count++;
            (callback||function(){})(chang);
        } );

        return count;
    }

    function each_channel(callback) {
        var count = 0;

        each( generate_channel_list(CHANNELS), function(channel) {
            var chan = CHANNELS[channel];

            if (!chan) return;

            count++;
            (callback||function(){})(chan);
        } );

        return count;
    }
    function _invoke_callback(response, callback, err) {
        if (typeof response == 'object') {
            if (response['error']) {
                var callback_data = {};

                if (response['message']) {
                    callback_data['message'] = response['message'];
                }

                if (response['payload']) {
                    callback_data['payload'] = response['payload'];
                }

                err && err(callback_data);
                return;

            }
            if (response['payload']) {
                if (response['next_page'])
                    callback && callback(response['payload'], response['next_page']);
                else
                    callback && callback(response['payload']);
                return;
            }
        }
        callback && callback(response);
    }

    function _invoke_error(response,err) {

        if (typeof response == 'object' && response['error']) {
                var callback_data = {};

                if (response['message']) {
                    callback_data['message'] = response['message'];
                }

                if (response['payload']) {
                    callback_data['payload'] = response['payload'];
                }
                
                err && err(callback_data);
                return;
        } else {
            err && err(response);
        }
    }


    function getResultData(http_data) {
        var result_data = {};
    }

    function objectShallowCopy(obj1, obj2) {
        if (obj1 && obj2) {
           for (var prop in obj2) {
              if(obj2.hasOwnProperty(prop)){
                obj1[prop] = obj2[prop];
              }
            }
        }
        return obj1
    }

    function getConfig(){
        return {
            'origin'    : STD_ORIGIN.split('://')[1],
            'ssl'       : (SSL == 's')?true:false,
            'uuid'      : UUID,
            'auth_key'  : AUTH_KEY
        }
    }

    function get_v4_cb_data(response) {
        var callback_data = {};
        if (typeof response == 'object') {
            if (response['error']) {
                if (response['message']) {
                    callback_data['message'] = response['message'];
                }

                if (response['payload']) {
                    callback_data['payload'] = response['payload'];
                }
                return callback_data;
            }
            if (response['payload']) {
                return response['payload'];
            }
        }
        return response; 
    }

    function _invoke_callback_v4(response, http_data, op_params, callback, err) {
        
        var v4_cb_data = objectShallowCopy(http_data, op_params);
        v4_cb_data['data'] = get_v4_cb_data(response);
        _invoke_callback(v4_cb_data, callback, err);
    }

    function _invoke_error_v4(response, http_data, op_params, err) {
        
        var v4_cb_data = objectShallowCopy(http_data, op_params);
        v4_cb_data['data'] = get_v4_cb_data(response);
        v4_cb_data['category'] = 'error'; 
        _invoke_callback(v4_cb_data, err);
    }

    function CR(args, callback, url1, data) {
            var callback        = args['callback']      || callback
            ,   err             = args['error']         || error
            ,   result          = args['result'] || result_cb
            ,   status          = args['status'] || status_cb
            ,   op_params       = setup['op_params']    || {}
            ,   jsonp           = jsonp_cb();

            data = data || {};
            
            if (!data['auth']) {
                data['auth'] = args['auth_key'] || AUTH_KEY;
            }
            
            var url = [
                    STD_ORIGIN, 'v1', 'channel-registration',
                    'sub-key', SUBSCRIBE_KEY
                ];

            url.push.apply(url,url1);
            
            if (jsonp) data['callback']              = jsonp;
            
            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);

                },
                url      : url
            });

    }

    // Announce Leave Event
    var SELF = {
        'add_origin' : function(origin) {
            ORIGINS.push(origin);
        },
        'remove_origin' : function(origin) {
            for (var a in ORIGINS) {
                if (ORIGINS[a] === origin) {
                    ORIGINS[a] = false;
                }
            }
        },
        'LEAVE' : function( channel, blocking, auth_key, callback, error ) {

            var data   = { 'uuid' : UUID, 'auth' : auth_key || AUTH_KEY }
            ,   origin = STD_ORIGIN
            ,   callback = callback || function(){}
            ,   err      = error    || function(){}
            ,   jsonp  = jsonp_cb();

            // Prevent Leaving a Presence Channel
            if (channel.indexOf(PRESENCE_SUFFIX) > 0) return true;

            if (COMPATIBLE_35) {
                if (!SSL)         return false;
                if (jsonp == '0') return false;
            }

            if (NOLEAVE)  return false;

            if (jsonp != '0') data['callback'] = jsonp;

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                blocking : blocking || SSL,
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    origin, 'v2', 'presence', 'sub_key',
                    SUBSCRIBE_KEY, 'channel', encode(channel), 'leave'
                ]
            });
            return true;
        },
        'LEAVE_GROUP' : function( channel_group, blocking, auth_key, callback, error ) {

            var data   = { 'uuid' : UUID, 'auth' : auth_key || AUTH_KEY }
            ,   origin = STD_ORIGIN
            ,   callback = callback || function(){}
            ,   err      = error    || function(){}
            ,   jsonp  = jsonp_cb();

            // Prevent Leaving a Presence Channel Group
            if (channel_group.indexOf(PRESENCE_SUFFIX) > 0) return true;

            if (COMPATIBLE_35) {
                if (!SSL)         return false;
                if (jsonp == '0') return false;
            }

            if (NOLEAVE)  return false;

            if (jsonp != '0') data['callback'] = jsonp;

            if (channel_group && channel_group.length > 0) data['channel-group'] = channel_group;

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                blocking : blocking || SSL,
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    origin, 'v2', 'presence', 'sub_key',
                    SUBSCRIBE_KEY, 'channel', encode(','), 'leave'
                ]
            });
            return true;
        },
        'set_resumed' : function(resumed) {
                RESUMED = resumed;
        },
        'get_cipher_key' : function() {
            return CIPHER_KEY;
        },
        'set_cipher_key' : function(key) {
            CIPHER_KEY = key;
        },
        'raw_encrypt' : function(input, key) {
            return encrypt(input, key);
        },
        'raw_decrypt' : function(input, key) {
            return decrypt(input, key);
        },
        'get_heartbeat' : function() {
            return PRESENCE_HB;
        },
        'set_heartbeat' : function(heartbeat, heartbeat_interval) {
            PRESENCE_HB = validate_presence_heartbeat(heartbeat, PRESENCE_HB, error);
            PRESENCE_HB_INTERVAL = heartbeat_interval || (PRESENCE_HB / 2) - 1;
            if (PRESENCE_HB == 2) {
                PRESENCE_HB_INTERVAL = 1;
            }
            CONNECT();
            _presence_heartbeat();
        },
        
        'get_heartbeat_interval' : function() {
            return PRESENCE_HB_INTERVAL;
        },
        
        'set_heartbeat_interval' : function(heartbeat_interval) {
            PRESENCE_HB_INTERVAL = heartbeat_interval;
            _presence_heartbeat();
        },
        
        'get_version' : function() {
            return SDK_VER;
        },
        'get_origin_heartbeat_interval' : function() {
            return ORIGIN_HB_INTERVAL;
        },
        'set_origin_heartbeat_interval' : function(origin_heartbeat_interval) {
            ORIGIN_HB_INTERVAL = origin_heartbeat_interval;
            _origin_heartbeat();
        },
        'get_sub_origin' : function() {
            return SUB_ORIGIN;
        },
        'getGcmMessageObject' : function(obj) {
            return {
                'data' : obj
            }
        },
        'getApnsMessageObject' : function(obj) {
            var x =  {
                'aps' : { 'badge' : 1, 'alert' : ''}
            }
            for (k in obj) {
                k[x] = obj[k];
            }
            return x;
        },
        'newPnMessage' : function() {
            var x = {};
            if (gcm) x['pn_gcm'] = gcm;
            if (apns) x['pn_apns'] = apns;
            for ( k in n ) {
                x[k] = n[k];
            }
            return x;
        },

        '_add_param' : function(key,val) {
            params[key] = val;
        },

        'channel_group' : function(args, callback) {
            var ns_ch       = args['channel_group']
            ,   callback    = callback         || args['callback']
            ,   channels    = args['channels'] || args['channel']
            ,   cloak       = args['cloak']
            ,   namespace
            ,   channel_group
            ,   url = []
            ,   data = {}
            ,   mode = args['mode'] || 'add';

            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };



            if (ns_ch) {
                var ns_ch_a = ns_ch.split(':');

                if (ns_ch_a.length > 1) {
                    namespace = (ns_ch_a[0] === '*')?null:ns_ch_a[0];

                    channel_group = ns_ch_a[1];
                } else {
                    channel_group = ns_ch_a[0];
                }
            }

            namespace && url.push('namespace') && url.push(encode(namespace));

            url.push('channel-group');

            if (channel_group && channel_group !== '*') {
                url.push(channel_group);
            }

            if (channels ) {
                if (isArray(channels)) {
                    channels = channels.join(',');
                }
                data[mode] = channels;
                data['cloak'] = (CLOAK)?'true':'false';
            } else {
                if (mode === 'remove') url.push('remove');
            }

            if (typeof cloak != 'undefined') data['cloak'] = (cloak)?'true':'false';

            CR(args, callback, url, data);
        },

        'channel_group_list_groups' : function(args, callback) {
            var namespace;
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_list_groups',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };


            namespace = args['namespace'] || args['ns'] || args['channel_group'] || null;
            if (namespace) {
                args["channel_group"] = namespace + ":*";
            }

            SELF['channel_group'](args, callback);
        },

        'channel_group_list_channels' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_list_channels',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            if (!args['channel_group']) return error('Missing Channel Group');
            SELF['channel_group'](args, callback);
        },

        'channel_group_remove_channel' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_remove_channel',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            if (!args['channel_group']) return error('Missing Channel Group');
            if (!args['channel'] && !args['channels'] ) return error('Missing Channel');

            args['mode'] = 'remove';
            SELF['channel_group'](args,callback);
        },

        'channel_group_remove_group' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_remove_group',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            if (!args['channel_group']) return error('Missing Channel Group');
            if (args['channel']) return error('Use channel_group_remove_channel if you want to remove a channel from a group.');

            args['mode'] = 'remove';
            SELF['channel_group'](args,callback);
        },

        'channel_group_add_channel' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_add_channel',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

           if (!args['channel_group']) return error('Missing Channel Group');
           if (!args['channel'] && !args['channels'] ) return error('Missing Channel');
            SELF['channel_group'](args,callback);
        },

        'channel_group_cloak' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_cloak',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            if (typeof args['cloak'] == 'undefined') {
                callback(CLOAK);
                return;
            }
            CLOAK = args['cloak'];
            SELF['channel_group'](args,callback);
        },

        'channel_group_list_namespaces' : function(args, callback) {
            var url = ['namespace'];
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_list_namespaces',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            CR(args, callback, url);
        },
        'channel_group_remove_namespace' : function(args, callback) {
            args['op_params'] = setup['op_params'] || {
                'operation'         : 'channel_group_remove_namespace',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            var url = ['namespace',args['namespace'],'remove'];
            CR(args, callback, url);
        },

        /*
            PUBNUB.history({
                channel  : 'my_chat_channel',
                limit    : 100,
                callback : function(history) { }
            });
        */
        'history' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   count            = args['count']    || args['limit'] || 100
            ,   reverse          = args['reverse']  || "false"
            ,   auth_key         = args['auth_key'] || AUTH_KEY
            ,   cipher_key       = args['cipher_key']
            ,   channel          = args['channel']
            ,   channel_group    = args['channel_group']
            ,   start            = args['start']
            ,   end              = args['end']
            ,   include_token    = args['include_token']
            ,   params           = {}
            ,   jsonp            = jsonp_cb();

            var op_params = {
                'operation'         : 'history',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            // Make sure we have a Channel
            if (!channel && !channel_group) return error('Missing Channel');
            if (!callback && !result)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            params['stringtoken'] = 'true';
            params['count']       = count;
            params['reverse']     = reverse;
            params['auth']        = auth_key;

            if (channel_group) {
                params['channel-group'] = channel_group;
                if (!channel) {
                    channel = ','; 
                }
            }
            if (jsonp) params['callback']              = jsonp;
            if (start) params['start']                 = start;
            if (end)   params['end']                   = end;
            if (include_token) params['include_token'] = 'true';

            // Send Message
            xdr({
                callback : jsonp,
                data     : _get_url_params(params),
                success  : function(response, http_data) {
                    if (typeof response == 'object' && response['error']) {
                        err({'message' : response['message'], 'payload' : response['payload']});
                        return;
                    }
                    var messages = response[0];
                    var decrypted_messages = [];
                    for (var a = 0; a < messages.length; a++) {
                        var new_message = decrypt(messages[a],cipher_key);
                        try {
                            decrypted_messages['push'](JSON['parse'](new_message));
                        } catch (e) {
                            decrypted_messages['push']((new_message));
                        }
                    }

                    !callback && _invoke_callback_v4([decrypted_messages, response[1], response[2]], http_data, op_params, result, status);
                    callback && _invoke_callback([decrypted_messages, response[1], response[2]], callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v2', 'history', 'sub-key',
                    SUBSCRIBE_KEY, 'channel', encode(channel)
                ]
            });
        },

        /*
            PUBNUB.replay({
                source      : 'my_channel',
                destination : 'new_channel'
            });
        */
        'replay' : function(args, callback) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   auth_key    = args['auth_key'] || AUTH_KEY
            ,   source      = args['source']
            ,   destination = args['destination']
            ,   stop        = args['stop']
            ,   start       = args['start']
            ,   end         = args['end']
            ,   reverse     = args['reverse']
            ,   limit       = args['limit']
            ,   jsonp       = jsonp_cb()
            ,   data        = {}
            ,   url;

            
            var op_params = {
                'operation'         : 'replay',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            // Check User Input
            if (!source)        return error('Missing Source Channel');
            if (!destination)   return error('Missing Destination Channel');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            // Setup URL Params
            if (jsonp != '0') data['callback'] = jsonp;
            if (stop)         data['stop']     = 'all';
            if (reverse)      data['reverse']  = 'true';
            if (start)        data['start']    = start;
            if (end)          data['end']      = end;
            if (limit)        data['count']    = limit;

            data['auth'] = auth_key;

            // Compose URL Parts
            url = [
                STD_ORIGIN, 'v1', 'replay',
                PUBLISH_KEY, SUBSCRIBE_KEY,
                source, destination
            ];

            // Start (or Stop) Replay!
            xdr({
                callback : jsonp,
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function() { callback([ 0, 'Disconnected' ]) },
                url      : url,
                data     : _get_url_params(data)
            });
        },

        /*
            PUBNUB.auth('AJFLKAJSDKLA');
        */
        'auth' : function(auth) {
            AUTH_KEY = auth;
            CONNECT();
        },

        /*
            PUBNUB.time(function(time){ });
        */
        'time' : function(callback) {

            var op_params = {
                'operation'         : 'time',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };
            var jsonp = jsonp_cb();

            var data = { 'uuid' : UUID, 'auth' : AUTH_KEY }

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                url      : [STD_ORIGIN, 'time', jsonp],
                success  : function(response, http_data) {
                    callback(response[0]);
                },
                fail     : function(response, http_data) { 
                    callback(0);
                }
            });
        },

        /*
            PUBNUB.publish({
                channel : 'my_chat_channel',
                message : 'hello!'
            });
        */
        'publish' : function( args, callback ) {
            var op_params = {
                'operation'         : 'publish',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };
            var msg      = args['message'];
            if (!msg) return error('Missing Message');

            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   channel  = args['channel'] || msg['channel']
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   cipher_key = args['cipher_key']
            ,   err      = args['error'] || msg['error']
            ,   status   = args['status'] || status_cb
            ,   post     = args['post'] || false
            ,   store    = ('store_in_history' in args) ? args['store_in_history']: true
            ,   jsonp    = jsonp_cb()
            ,   add_msg  = 'push'
            ,   url;

            if (args['prepend']) add_msg = 'unshift'

            if (!channel)       return error('Missing Channel');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (msg['getPubnubMessage']) {
                msg = msg['getPubnubMessage']();
            }

            // If trying to send Object
            msg = JSON['stringify'](encrypt(msg, cipher_key));

            // Create URL
            url = [
                STD_ORIGIN, 'publish',
                PUBLISH_KEY, SUBSCRIBE_KEY,
                0, encode(channel),
                jsonp, encode(msg)
            ];

            params = { 'uuid' : UUID, 'auth' : auth_key }

            if (!store) params['store'] ="0"

            if (USE_INSTANCEID) params['instanceid'] = INSTANCEID;

            // Queue Message Send
            PUB_QUEUE[add_msg]({
                callback : jsonp,
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                url      : url,
                data     : _get_url_params(params),
                fail     : function(response, http_data){
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                    publish(1);
                },
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                    publish(1);
                },
                mode     : (post)?'POST':'GET'
            });

            // Send Message
            publish();
        },

        /*
            PUBNUB.unsubscribe({ channel : 'my_chat' });
        */
        'unsubscribe' : function(args, callback) {
            var channel       = args['channel']
            ,   channel_group = args['channel_group']
            ,   auth_key      = args['auth_key']    || AUTH_KEY
            ,   callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb

            TIMETOKEN   = 0;
            //SUB_RESTORE = 1;    REVISIT !!!!

            if (channel) {
                // Prepare Channel(s)
                channel = map( (
                    channel.join ? channel.join(',') : ''+channel
                ).split(','), function(channel) {
                    if (!CHANNELS[channel]) return;
                    return channel + ',' + channel + PRESENCE_SUFFIX;
                } ).join(',');

                // Iterate over Channels
                each( channel.split(','), function(ch) {
                    var CB_CALLED = true;
                    if (!ch) return;
                    CHANNELS[ch] = 0;
                    if (ch in STATE) delete STATE[ch];
                    if (READY) {
                        CB_CALLED = SELF['LEAVE']( ch, 0 , auth_key, callback, err);
                    }
                    if (!CB_CALLED) callback({action : "leave"});

                    
                } );
            }

            if (channel_group) {
                // Prepare channel group(s)
                channel_group = map( (
                    channel_group.join ? channel_group.join(',') : ''+channel_group
                ).split(','), function(channel_group) {
                    if (!CHANNEL_GROUPS[channel_group]) return;
                    return channel_group + ',' + channel_group + PRESENCE_SUFFIX;
                } ).join(',');

                // Iterate over channel groups
                each( channel_group.split(','), function(chg) {
                    var CB_CALLED = true;
                    if (!chg) return;
                    CHANNEL_GROUPS[chg] = 0;
                    if (chg in STATE) delete STATE[chg];
                    if (READY) {
                        CB_CALLED = SELF['LEAVE_GROUP']( chg, 0 , auth_key, callback, err);
                    }
                    if (!CB_CALLED) callback({action : "leave"});

                } );
            }

            // Reset Connection if Count Less
            CONNECT();
        },

        /*
            PUBNUB.subscribe({
                channel  : 'my_chat'
                callback : function(message) { }
            });
        */
        'subscribe' : function( args, callback ) {
            var channel         = args['channel']
            ,   channel_group   = args['channel_group']
            ,   result          = args['result']      || result_cb
            ,   status          = args['status']      || status_cb
            ,   auth_key        = args['auth_key']    || AUTH_KEY
            ,   idlecb          = args['idle']        || function(){}
            ,   presence        = args['presence']    || 0
            ,   noheresync      = args['noheresync']  || 0
            ,   backfill        = args['backfill']    || 0
            ,   timetoken       = args['timetoken']   || 0
            ,   sub_timeout     = args['timeout']     || SUB_TIMEOUT
            ,   windowing       = args['windowing']   || SUB_WINDOWING
            ,   state           = args['state']
            ,   V2              = args['v2']
            ,   heartbeat       = args['heartbeat'] || args['pnexpires']
            ,   heartbeat_interval = args['heartbeat_interval']
            ,   restore         = args['restore'] || SUB_RESTORE;

            
            var op_params = {
                'operation'         : 'subscribe',
                'connection'        : 'sub',
                'wasAutoRetried'    : true,
                'config'            : getConfig()
            };

            var err = function(r, http_data){

                if (status) {
                    var status_event = http_data || {};

                    status_event.channel = channel;
                    status_event.category = 'error';

                    status && _invoke_callback_v4(r, status_event, op_params, status);
                }
                if (args['error'] || SUB_ERROR){
                    var errcb = args['error'] || SUB_ERROR || function(){};
                    errcb && _invoke_error(r, errcb);

                }
              
            };
            var callback;

            if (args['callback']) {
                var cb = args['callback'];
                callback = 
                    function (message, http_data, message_envelope, channel, latency, real_channel, expanded) {
                        cb && cb(message, message_envelope, channel, latency, real_channel, expanded);
                    };

            } else {
                callback = 
                    function (message, http_data, message_envelope, channel, latency, real_channel, expanded) {
                        if (message_envelope) http_data['message_envelope'] = message_envelope;
                        if (channel)        http_data['channel']        = channel;
                        if (latency)        http_data['latency']        = latency;
                        if (real_channel)   http_data['real_channel']   = real_channel;
                        if (expanded)       http_data['expanded']       = expanded;
                        _invoke_callback_v4(message, http_data, op_params, result, status);
                    };
            }

            var callback2 = args['callback'] || function (message, http_data, message_envelope, channel, real_channel, expanded) {
                callback && callback(message, http_data, message_envelope, channel, null, real_channel, expanded);
            }

            var connect = args['connect'] || function(channel, http_data) {
                var status_event = http_data || {};

                status_event.channel = channel;
                status_event.category = 'connect';

                status && status(status_event);
            }

            var disconnect = args['disconnect'] || function(channel, http_data) {
                var status_event = http_data || {};
                
                status_event.channel = channel;
                status_event.category = 'disconnect';

                status && status(status_event);
            }

            var reconnect = args['reconnect'] || function(channel, http_data) {
                var status_event = http_data || {};

                status_event.channel = channel;
                status_event.category = 'reconnect';

                status && status(status_event);
            }

            // Restore Enabled?
            SUB_RESTORE = restore;

            // Always Reset the TT
            TIMETOKEN = timetoken;

            // Make sure we have a Channel
            if (!channel && !channel_group) {
                return error('Missing Channel');
            }

            //if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (heartbeat || heartbeat === 0 || heartbeat_interval || heartbeat_interval === 0) {
                SELF['set_heartbeat'](heartbeat, heartbeat_interval);
            }

            // Setup Channel(s)
            if (channel) {
                each( (channel.join ? channel.join(',') : ''+channel).split(','),
                function(channel) {
                    var settings = CHANNELS[channel] || {};

                    // Store Channel State
                    CHANNELS[SUB_CHANNEL = channel] = {
                        name                : channel,
                        connection_state    : CONNECTION_STATES.EXPECTED_DISCONNECTED,
                        connected           : settings.connected,
                        disconnected        : settings.disconnected,
                        subscribed          : 1,
                        callback            : SUB_CALLBACK = (V2)?callback2:callback,
                        'cipher_key'        : args['cipher_key'],
                        connect             : connect,
                        disconnect          : disconnect,
                        reconnect           : reconnect
                    };

                    if (state) {
                        if (channel in state) {
                            STATE[channel] = state[channel];
                        } else {
                            STATE[channel] = state;
                        }
                    }

                    // Presence Enabled?
                    if (!presence) return;

                    // Subscribe Presence Channel
                    SELF['subscribe']({
                        'channel'  : channel + PRESENCE_SUFFIX,
                        'callback' : presence,
                        'restore'  : restore
                    });

                    // Presence Subscribed?
                    if (settings.subscribed) return;

                    // See Who's Here Now?
                    if (noheresync) return;
                    SELF['here_now']({
                        'channel'  : channel,
                        'data'     : _get_url_params({ 'uuid' : UUID, 'auth' : auth_key }),
                        'callback' : function(here) {
                            each( 'uuids' in here ? here['uuids'] : [],
                            function(uid) { presence( {
                                'action'    : 'join',
                                'uuid'      : uid,
                                'timestamp' : Math.floor(rnow() / 1000),
                                'occupancy' : here['occupancy'] || 1
                            }, here, channel ); } );
                        }
                    });
                } );
            }

            // Setup Channel Groups
            if (channel_group) {
                each( (channel_group.join ? channel_group.join(',') : ''+channel_group).split(','),
                function(channel_group) {
                    var settings = CHANNEL_GROUPS[channel_group] || {};

                    CHANNEL_GROUPS[channel_group] = {
                        connection_state    : CONNECTION_STATES.EXPECTED_DISCONNECTED,
                        name         : channel_group,
                        connected    : settings.connected,
                        disconnected : settings.disconnected,
                        subscribed   : 1,
                        callback     : SUB_CALLBACK = (V2)?callback2:callback,
                        'cipher_key' : args['cipher_key'],
                        connect      : connect,
                        disconnect   : disconnect,
                        reconnect    : reconnect
                    };

                    // Presence Enabled?
                    if (!presence) return;

                    // Subscribe Presence Channel
                    SELF['subscribe']({
                        'channel_group'  : channel_group + PRESENCE_SUFFIX,
                        'callback' : presence,
                        'restore'  : restore,
                        'v2'       : V2,
                        'auth_key' : auth_key
                    });

                    // Presence Subscribed?
                    if (settings.subscribed) return;

                    // See Who's Here Now?
                    if (noheresync) return;
                    SELF['here_now']({
                        'channel_group'  : channel_group,
                        'data'           : _get_url_params({ 'uuid' : UUID, 'auth' : auth_key }),
                        'callback' : function(here) {
                            each( 'uuids' in here ? here['uuids'] : [],
                            function(uid) { presence( {
                                'action'    : 'join',
                                'uuid'      : uid,
                                'timestamp' : Math.floor(rnow() / 1000),
                                'occupancy' : here['occupancy'] || 1
                            }, here, channel_group ); } );
                        }
                    });
                } );
            }

            
            // Test Network Connection
            function _test_connection(success) {
                if (success) {
                    // Begin Next Socket Connection
                    timeout( CONNECT, 1000 );
                }
                else {
                    // New Origin on Failed Connection
                    //STD_ORIGIN = nextorigin( ORIGINS || ORIGIN, ++cur );
                    //SUB_ORIGIN = nextorigin( ORIGINS || ORIGIN, cur );

                    // Re-test Connection
                    timeout( function() {
                        SELF['time'](_test_connection);
                    }, 1000 );
                }

                _update_connection_states_and_invoke_callbacks((success)?1:0);

            }
            

            function _update_connection_states_and_invoke_callbacks(connected, http_data){

                // Connect
                each_channel(function(channel){
                    var cb = channel[CONNECTION_STATE_MACHINE[channel.connection_state][connected]['callback']]
                    channel.connection_state = CONNECTION_STATE_MACHINE[channel.connection_state][connected]['state'];
                    cb && cb(channel.name, http_data);

                });

                // Connect for channel groups
                each_channel_group(function(channel_group){
                    var cb = channel_group[CONNECTION_STATE_MACHINE[channel_group.connection_state][connected]['callback']];
                    channel_group.connection_state = CONNECTION_STATE_MACHINE[channel_group.connection_state][connected]['state'];
                    cb && cb(channel_group.name, http_data);
                });
            }

            // Evented Subscribe
            function _connect() {
                var jsonp           = jsonp_cb()
                ,   channels        = generate_channel_list(CHANNELS).join(',')
                ,   channel_groups  = generate_channel_group_list(CHANNEL_GROUPS).join(',');

                // Stop Connection
                if (!channels && !channel_groups) return;

                if (!channels) channels = ',';

                // Connect to PubNub Subscribe Servers
                _reset_offline();

                var data = _get_url_params({ 'uuid' : UUID, 'auth' : auth_key });

                if (channel_groups) {
                    data['channel-group'] = channel_groups;
                }


                var st = JSON.stringify(STATE);
                if (st.length > 2) data['state'] = JSON.stringify(STATE);

                if (PRESENCE_HB) data['heartbeat'] = PRESENCE_HB;

                function _change_key(o, ok, nk) {
                    if (typeof o[ok] !== 'undefined'){
                        var t = o[ok];
                        o[nk] = t;
                        delete o[ok];
                    }
                    return true;
                }
                function _v2_expand_keys(m) {
                    m['o'] && _change_key(m['o'], 't', 'timetoken') && _change_key(m['o'], 'r', 'region_code')
                    m['p'] && _change_key(m['p'], 't', 'timetoken') && _change_key(m['p'], 'r', 'region_code') 
                    _change_key(m,'i','issuing_client_id');
                    _change_key(m,'s','sequence_number');
                    _change_key(m,'o','origination_timetoken');
                    _change_key(m,'p','publish_timetoken');
                    _change_key(m,'k','subscribe_key');
                    _change_key(m,'c','channel');
                    _change_key(m,'b','subscription_match');
                    _change_key(m,'r','replication_map');
                    _change_key(m,'ear','eat_after_reading');
                    _change_key(m,'d','payload');
                    _change_key(m,'u','user_metadata');
                    _change_key(m,'w','waypoint_list');
                    return m;
                }


                function subscribeSuccessHandlerV1(messages, http_data) {
                    // Check for Errors
                    if (!messages || (
                        typeof messages == 'object' &&
                        'error' in messages         &&
                        messages['error']
                    )) {
                        err(messages['error'], http_data);
                        return timeout( CONNECT, 1000 );
                    }

                    // User Idle Callback
                    idlecb(messages[1]);

                    // Restore Previous Connection Point if Needed
                    TIMETOKEN = !TIMETOKEN               &&
                                SUB_RESTORE              &&
                                db['get'](SUBSCRIBE_KEY) || messages[1];


                    _update_connection_states_and_invoke_callbacks(1, http_data);


                    if (RESUMED && !SUB_RESTORE) {
                            TIMETOKEN = 0;
                            RESUMED = false;
                            // Update Saved Timetoken
                            db['set']( SUBSCRIBE_KEY, 0 );
                            timeout( _connect, windowing );
                            return;
                    }

                    // Invoke Memory Catchup and Receive Up to 100
                    // Previous Messages from the Queue.
                    if (backfill) {
                        TIMETOKEN = 10000;
                        backfill  = 0;
                    }

                    // Update Saved Timetoken
                    db['set']( SUBSCRIBE_KEY, messages[1] );

                    // Route Channel <---> Callback for Message
                    var next_callback = (function() {
                        var channels = '';
                        var channels2 = '';

                        if (messages.length > 3) {
                            channels  = messages[3];
                            channels2 = messages[2];
                        } else if (messages.length > 2) {
                            channels = messages[2];
                        } else {
                            channels =  map(
                                generate_channel_list(CHANNELS), function(chan) { return map(
                                    Array(messages[0].length)
                                    .join(',').split(','),
                                    function() { return chan; }
                                ) }).join(',')
                        }

                        var list  = channels.split(',');
                        var list2 = (channels2)?channels2.split(','):[];

                        return function() {
                            var channel  = list.shift()||SUB_CHANNEL;
                            var channel2 = list2.shift();

                            var chobj = {};

                            if (channel2) {
                                if (channel && channel.indexOf('-pnpres') >= 0 
                                    && channel2.indexOf('-pnpres') < 0) {
                                    channel2 += '-pnpres';
                                }
                                chobj = CHANNEL_GROUPS[channel2] || CHANNELS[channel2] || {'callback' : function(){}};
                            } else {
                                chobj = CHANNELS[channel];
                            }

                            var r = [
                                chobj
                                .callback||SUB_CALLBACK,
                                channel.split(PRESENCE_SUFFIX)[0]
                            ];
                            channel2 && r.push(channel2.split(PRESENCE_SUFFIX)[0]);
                            return r;
                        };
                    })();

                    var latency = detect_latency(+messages[1]);
                    each( messages[0], function(msg) {
                        var next = next_callback();
                        var decrypted_msg = decrypt(msg,
                            (CHANNELS[next[1]])?CHANNELS[next[1]]['cipher_key']:null);
                        next[0] && next[0]( decrypted_msg, http_data, messages, next[2] || next[1], latency, next[1]);
                    });

                    timeout( _connect, windowing );
                }

                function subscribeSuccessHandlerV2(response, http_data) {

                    //SUB_RECEIVER = null;
                    // Check for Errors
                    if (!response || (
                        typeof response == 'object' &&
                        'error' in response         &&
                        response['error']
                    )) {
                        err(response['error'], http_data);
                        return timeout( CONNECT, 1000 );
                    }

                    // User Idle Callback
                    idlecb(response['t']['t']);

                    // Restore Previous Connection Point if Needed
                    TIMETOKEN = !TIMETOKEN               &&
                                SUB_RESTORE              &&
                                db['get'](SUBSCRIBE_KEY) || response['t']['t'];

                    // Connect
                    each_channel(function(channel){
                        if (channel.connected) return;
                        channel.connected = 1;
                        channel.connect(channel.name, http_data);
                    });

                    // Connect for channel groups
                    each_channel_group(function(channel_group){
                        if (channel_group.connected) return;
                        channel_group.connected = 1;
                        channel_group.connect(channel_group.name, http_data);
                    });

                    if (RESUMED && !SUB_RESTORE) {
                            TIMETOKEN = 0;
                            RESUMED = false;
                            // Update Saved Timetoken
                            db['set']( SUBSCRIBE_KEY, 0 );
                            timeout( _connect, windowing );
                            return;
                    }

                    // Invoke Memory Catchup and Receive Up to 100
                    // Previous Messages from the Queue.
                    if (backfill) {
                        TIMETOKEN = 10000;
                        backfill  = 0;
                    }

                    // Update Saved Timetoken
                    db['set']( SUBSCRIBE_KEY, response['t']['t'] );

                    var messages = response['m'];

                    for (var i in messages) {
                        var message     = messages[i]
                        ,   channel     = message['c']
                        ,   sub_channel = message['b'];

                        var chobj = CHANNELS[sub_channel] || CHANNEL_GROUPS[sub_channel] || 
                                    CHANNELS[channel];

                        if (chobj) {
                            var callback = chobj['callback'];
                            callback && 
                            callback(message['d'], http_data, message, message['b'] || message['c'], 
                                message['c'], _v2_expand_keys(message));
                        }
                    }

                    timeout( _connect, windowing );
                }

                if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;


                start_presence_heartbeat();
                start_origin_heartbeat();
                start_optimal_origin_check_heartbeat();

                SUB_RECEIVER = xdr({
                    timeout  : sub_timeout,
                    callback : jsonp,
                    fail     : function(response, http_data) {
                        if (response && response['error'] && response['service']) {
                            err(response, http_data);
                            _test_connection(1);
                        } else {
                            SELF['time'](function(success){
                                !success && ( err(response, http_data));
                                _test_connection(success);
                            });
                        }
                    },
                    data     : _get_url_params(data),
                    url      : [
                        SUB_ORIGIN, ((V2)?'v2/':'') + 'subscribe',
                        SUBSCRIBE_KEY, encode(channels),
                        jsonp, TIMETOKEN
                    ],
                    success : (V2)?subscribeSuccessHandlerV2:subscribeSuccessHandlerV1
                });
            }

            CONNECT = function() {
                _reset_offline();
                timeout( _connect, windowing );
            };

            // Reduce Status Flicker
            if (!READY) return READY_BUFFER.push(CONNECT);

            // Connect Now
            CONNECT();
        },

        /*
            PUBNUB.here_now({ channel : 'my_chat', callback : fun });
        */
        'here_now' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   channel  = args['channel']
            ,   channel_group = args['channel_group']
            ,   jsonp    = jsonp_cb()
            ,   uuids    = ('uuids' in args) ? args['uuids'] : true
            ,   state    = args['state']
            ,   data     = { 'uuid' : UUID, 'auth' : auth_key };
            
            var op_params = {
                'operation'         : 'here_now',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };


            if (!uuids) data['disable_uuids'] = 1;
            if (state) data['state'] = 1;

            // Make sure we have a Channel
            if (!callback && !result)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            var url = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub_key', SUBSCRIBE_KEY
                ];

            channel && url.push('channel') && url.push(encode(channel));

            if (jsonp != '0') { data['callback'] = jsonp; }

            if (channel_group) {
                data['channel-group'] = channel_group;
                !channel && url.push('channel') && url.push(','); 
            }

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : url
            });
        },

        /*
            PUBNUB.current_channels_by_uuid({ channel : 'my_chat', callback : fun });
        */
        'where_now' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   jsonp    = jsonp_cb()
            ,   uuid     = args['uuid']     || UUID
            ,   data     = { 'auth' : auth_key };

            var op_params = {
                'operation'         : 'where_now',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };


            // Make sure we have a Channel
            if (!callback && !result)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (jsonp != '0') { data['callback'] = jsonp; }

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub_key', SUBSCRIBE_KEY,
                    'uuid', encode(uuid)
                ]
            });
        },

        'state' : function(args, callback) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   jsonp    = jsonp_cb()
            ,   state    = args['state']
            ,   uuid     = args['uuid'] || UUID
            ,   channel  = args['channel']
            ,   channel_group = args['channel_group']
            ,   url
            ,   data     = _get_url_params({ 'auth' : auth_key });

            var op_params = {
                'operation'         : 'state',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            // Make sure we have a Channel
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!uuid) return error('Missing UUID');
            if (!channel && !channel_group) return error('Missing Channel');

            if (jsonp != '0') { data['callback'] = jsonp; }

            if (typeof channel != 'undefined'
                && CHANNELS[channel] && CHANNELS[channel].subscribed ) {
                if (state) STATE[channel] = state;
            }

            if (typeof channel_group != 'undefined'
                && CHANNEL_GROUPS[channel_group]
                && CHANNEL_GROUPS[channel_group].subscribed
                ) {
                if (state) STATE[channel_group] = state;
                data['channel-group'] = channel_group;

                if (!channel) {
                    channel = ',';
                }
            }

            data['state'] = JSON.stringify(state);

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            if (state) {
                url      = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel', channel,
                    'uuid', uuid, 'data'
                ]
            } else {
                url      = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel', channel,
                    'uuid', encode(uuid)
                ]
            }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : url

            });

        },

        /*
            PUBNUB.grant({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                ttl      : 24 * 60, // Minutes
                read     : true,
                write    : true,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'grant' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   channel         = args['channel']
            ,   channel_group   = args['channel_group']
            ,   jsonp           = jsonp_cb()
            ,   ttl             = args['ttl']
            ,   r               = (args['read'] )?"1":"0"
            ,   w               = (args['write'])?"1":"0"
            ,   m               = (args['manage'])?"1":"0"
            ,   auth_key        = args['auth_key'];

            var op_params = args['op_params'] || {
                'operation'         : 'grant',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            if (!callback && !result)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SECRET_KEY)    return error('Missing Secret Key');

            var timestamp  = Math.floor(new Date().getTime() / 1000)
            ,   sign_input = SUBSCRIBE_KEY + "\n" + PUBLISH_KEY + "\n"
                    + "grant" + "\n";

            var data = {
                'w'         : w,
                'r'         : r,
                'timestamp' : timestamp
            };
            if (args['manage']) {
                data['m'] = m;
            }
            if (typeof channel != 'undefined' && channel != null && channel.length > 0) data['channel'] = channel;
            if (typeof channel_group != 'undefined' && channel_group != null && channel_group.length > 0) {
                data['channel-group'] = channel_group;
            }
            if (jsonp != '0') { data['callback'] = jsonp; }
            if (ttl || ttl === 0) data['ttl'] = ttl;

            if (auth_key) data['auth'] = auth_key;

            data = _get_url_params(data)

            if (!auth_key) delete data['auth'];

            sign_input += _get_pam_sign_input_from_params(data);

            var signature = hmac_SHA256( sign_input, SECRET_KEY );

            signature = signature.replace( /\+/g, "-" );
            signature = signature.replace( /\//g, "_" );

            data['signature'] = signature;

            xdr({
                callback : jsonp,
                data     : data,
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v1', 'auth', 'grant' ,
                    'sub-key', SUBSCRIBE_KEY
                ]
            });
        },

        /*
         PUBNUB.mobile_gw_provision ({
         device_id: 'A655FBA9931AB',
         op       : 'add' | 'remove',
         gw_type  : 'apns' | 'gcm',
         channel  : 'my_chat',
         callback : fun,
         error    : fun,
         });
         */

        'mobile_gw_provision' : function( args ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   auth_key       = args['auth_key'] || AUTH_KEY
            ,   jsonp          = jsonp_cb()
            ,   channel        = args['channel']
            ,   op             = args['op']
            ,   gw_type        = args['gw_type']
            ,   device_id      = args['device_id']
            ,   url;

            var op_params = {
                'operation'         : 'mobile_gw_provision',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            if (!device_id)     return error('Missing Device ID (device_id)');
            if (!gw_type)       return error('Missing GW Type (gw_type: gcm or apns)');
            if (!op)            return error('Missing GW Operation (op: add or remove)');
            if (!channel)       return error('Missing gw destination Channel (channel)');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            // Create URL
            url = [
                STD_ORIGIN, 'v1/push/sub-key',
                SUBSCRIBE_KEY, 'devices', device_id
            ];

            params = { 'uuid' : UUID, 'auth' : auth_key, 'type': gw_type};

            if (op == "add") {
                params['add'] = channel;
            } else if (op == "remove") {
                params['remove'] = channel;
            }

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                callback : jsonp,
                data     : params,
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : url
            });

        },

        /*
            PUBNUB.audit({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                read     : true,
                write    : true,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'audit' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            ,   channel         = args['channel']
            ,   channel_group   = args['channel_group']
            ,   auth_key        = args['auth_key']
            ,   jsonp           = jsonp_cb();

            var op_params = args['op_params'] || {
                'operation'         : 'audit',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            // Make sure we have a Channel
            if (!callback && !result)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SECRET_KEY)    return error('Missing Secret Key');

            var timestamp  = Math.floor(new Date().getTime() / 1000)
            ,   sign_input = SUBSCRIBE_KEY + "\n"
                + PUBLISH_KEY + "\n"
                + "audit" + "\n";

            var data = {'timestamp' : timestamp };
            if (jsonp != '0') { data['callback'] = jsonp; }
            if (typeof channel != 'undefined' && channel != null && channel.length > 0) data['channel'] = channel;
            if (typeof channel_group != 'undefined' && channel_group != null && channel_group.length > 0) {
                data['channel-group'] = channel_group;
            }
            if (auth_key) data['auth']    = auth_key;

            data = _get_url_params(data);

            if (!auth_key) delete data['auth'];

            sign_input += _get_pam_sign_input_from_params(data);

            var signature = hmac_SHA256( sign_input, SECRET_KEY );

            signature = signature.replace( /\+/g, "-" );
            signature = signature.replace( /\//g, "_" );

            data['signature'] = signature;
            xdr({
                callback : jsonp,
                data     : data,
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v1', 'auth', 'audit' ,
                    'sub-key', SUBSCRIBE_KEY
                ]
            });
        },

        /*
            PUBNUB.revoke({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'revoke' : function( args, callback ) {
            args['read']  = false;
            args['write'] = false;
            args['op_params'] = {
                'operation'         : 'revoke',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };
            SELF['grant']( args, callback );
        },
        'set_uuid' : function(uuid) {
            UUID = uuid;
            CONNECT();
        },
        'get_uuid' : function() {
            return UUID;
        },
        'isArray'  : function(arg) {
            return isArray(arg);
        },
        'get_subscibed_channels' : function() {
            return generate_channel_list(CHANNELS, true);
        },
        'presence_heartbeat' : function(args) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            var jsonp    = jsonp_cb();
            var data     = { 'uuid' : UUID, 'auth' : AUTH_KEY };

            var op_params = {
                'operation'         : 'presence_heartbeat',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            var st = JSON['stringify'](STATE);
            if (st.length > 2) data['state'] = JSON['stringify'](STATE);

            if (PRESENCE_HB > 0 && PRESENCE_HB < 320) data['heartbeat'] = PRESENCE_HB;

            if (jsonp != '0') { data['callback'] = jsonp; }

            var channels        = encode(generate_channel_list(CHANNELS, true)['join'](','));
            var channel_groups  = generate_channel_group_list(CHANNEL_GROUPS, true)['join'](',');

            if (!channels) channels = ',';
            if (channel_groups) data['channel-group'] = channel_groups;

            if (USE_INSTANCEID) data['instanceid'] = INSTANCEID;

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                url      : [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel' , channels,
                    'heartbeat'
                ],
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                }
            });
        },
        'stop_timers': function () {
            clearTimeout(_poll_timer);
            clearTimeout(_poll_timer2);
        },
        'origin_heartbeat' : function(args) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']
            ,   result           = args['result']   || result_cb
            ,   status           = args['status']   || status_cb
            var jsonp    = jsonp_cb();
            var origin   = (args['origin'])? 'http'+SSL+'://' + args['origin']:SUB_ORIGIN;
            var data     = { 'uuid' : UUID, 'auth' : AUTH_KEY };

            var op_params = {
                'operation'         : 'origin_heartbeat',
                'connection'        : 'non-sub',
                'wasAutoRetried'    : false,
                'config'            : getConfig()
            };

            xdr({
                callback : jsonp,
                data     : data,
                timeout  : NON_SUBSCRIBE_TIMEOUT,
                url      : [
                    origin, 'time', '0'
                ],
                success  : function(response, http_data) {
                    !callback && _invoke_callback_v4(response, http_data, op_params, result, status);
                    callback && _invoke_callback(response, callback, err);
                },
                fail     : function(response, http_data) {
                    !err && _invoke_error_v4(response, http_data, op_params, status);
                    err && _invoke_error(response, err);
                }
            });
        },

        // Expose PUBNUB Functions
        'xdr'           : xdr,
        'ready'         : ready,
        'db'            : db,
        'uuid'          : generate_uuid,
        'map'           : map,
        'each'          : each,
        'each-channel'  : each_channel,
        'grep'          : grep,
        'offline'       : function(){ _reset_offline(
            1, { "message" : "Offline. Please check your network settings." })
        },
        'supplant'      : supplant,
        'now'           : rnow,
        'unique'        : unique,
        'updater'       : updater
    };

    function _poll_online() {
        _is_online() || _reset_offline( 1, {
            "error" : "Offline. Please check your network settings. "
        });
        _poll_timer && clearTimeout(_poll_timer);
        _poll_timer = timeout( _poll_online, 1000 );
    }

    function _poll_online2() {
        if (!TIME_CHECK) return;
        SELF['time'](function(success){
            detect_time_detla( function(){}, success );
            success || _reset_offline( 1, {
                "error" : "Heartbeat failed to connect to Pubnub Servers." +
                    "Please check your network settings."
                });
            _poll_timer2 && clearTimeout(_poll_timer2);
            _poll_timer2 = timeout( _poll_online2, KEEPALIVE );
        });
    }

    function _reset_offline(err, msg) {
        SUB_RECEIVER && SUB_RECEIVER(err, msg);
        SUB_RECEIVER = null;

        clearTimeout(_poll_timer);
        clearTimeout(_poll_timer2);
    }
    
    if (!UUID) UUID = SELF['uuid']();
    if (!INSTANCEID) INSTANCEID = SELF['uuid']();
    db['set']( SUBSCRIBE_KEY + 'uuid', UUID );

    _poll_timer  = timeout( _poll_online,  1000    );
    _poll_timer2 = timeout( _poll_online2, KEEPALIVE );
    PRESENCE_HB_TIMEOUT = timeout(
        start_presence_heartbeat,
        ( PRESENCE_HB_INTERVAL - 3000 )
    );

    // Detect Age of Message
    function detect_latency(tt) {
        var adjusted_time = rnow() - TIME_DRIFT;
        return adjusted_time - tt / 10000;
    }

    detect_time_detla();
    function detect_time_detla( cb, time ) {
        var stime = rnow();

        time && calculate(time) || SELF['time'](calculate);

        function calculate(time) {
            if (!time) return;
            var ptime   = time / 10000
            ,   latency = (rnow() - stime) / 2;
            TIME_DRIFT = rnow() - (ptime + latency);
            cb && cb(TIME_DRIFT);
        }
    }

    return SELF;
}
