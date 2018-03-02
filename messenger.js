// Description:
//   Node Messenger SDK
//
// Dependencies:
//   form-data
//   scoped-http-client
//   fs
//
// Configuration:
//   OAuth token
//
// Commands:
//
// Author:
//   Alterdesk

// Requirements
var FormData = require('form-data');
var HttpClient = require('scoped-http-client');
var UuidV1 = require('uuid/v1');
var Moment = require('moment');
var FileSystem = require('fs');
var Mkdirp = require('mkdirp');
var Request = require('request');
var Path = require('path');
var OS = require('os');

var tmpDir = Path.resolve(OS.tmpdir(), 'messenger-downloads');

module.exports = {

    // Api connection class
    Api: class {

        /*
        *   High level messenger API helper functions
        */

        getAttachmentUrl(chatId, attachmentId, isGroup, isAux, callback) {
          var attachmentData = {};
          attachmentData["headers"] = false;
          var methodPrefix = "";
          if(isAux) {
            methodPrefix += "aux/"
          }
          if(isGroup) {
            methodPrefix += "groupchats/";
          } else {
            methodPrefix += "conversations/";
          }
          this.get(methodPrefix + chatId + "/attachments/" + attachmentId + this.toGetParameters(attachmentData), callback);
        };

        getChatPdfUrl(chatId, isGroup, isAux, startDate, endDate, callback) {
          var pdfData = {};
          if(startDate != null) {
            pdfData["start_date"] = this.dateToString(startDate);
          }
          if(endDate) {
            pdfData["end_date"] = this.dateToString(endDate);
          }
          pdfData["headers"] = false;
          var methodPrefix = "";
          if(isAux) {
            methodPrefix += "aux/"
          }
          if(isGroup) {
            methodPrefix += "groupchats/";
          } else {
            methodPrefix += "conversations/";
          }
          this.get(methodPrefix + chatId + "/pdf" + this.toGetParameters(pdfData), callback);
        };

        invite(inviteUserData, callback) {
          var inviteData = {};
          inviteData["create_conversation"] = inviteUserData.createConversation;
          if(inviteUserData.email != null) {
            inviteData["email"] = inviteUserData.email;
          } else if(inviteUsersData.phoneNumber != null) {
//            inviteData["phone_number"] = inviteUserData.phoneNumber; // TODO
          }
          inviteData["first_name"] = inviteUserData.firstName;
          inviteData["last_name"] = inviteUserData.lastName;
          if(inviteUserData.inviteMessage != null) {
            inviteData["invite_text"] = inviteUserData.inviteMessage;  // Only used when creating conversation
          }
          if(inviteUsersData.auxId != null) {
            inviteData["aux_id"] = inviteUsersData.auxId;
          }
          var invitePostJson = JSON.stringify(inviteData);

          if(inviteUserData.inviteType == "coworker") {
              this.post("users/invite/coworker", invitePostJson, callback);
          } else if(inviteUserData.inviteType == "contact") {
              this.post("users/invite/contact", invitePostJson, callback);
          } else if(inviteUserData.inviteType == "private_user") {
              this.post("users/invite/private", invitePostJson, callback);
          } else {
            console.error("Unknown invite type on invite: \"" + inviteUserData.inviteType + "\"")
            callback(false, null);
          }
        };

        createGroup(groupData, callback) {
          // Group chat settings
          var settingsPostData = {};
          settingsPostData["allow_contacts"] = groupData.allowContacts;
          settingsPostData["auto_close_after"] = groupData.autoCloseAfter;
          settingsPostData["auto_expire_after"] = groupData.autoExpireAfter;
          settingsPostData["hybrid_messaging"] = groupData.hybridMessaging;
          settingsPostData["members_can_invite"] = groupData.membersCanInvite;

          var hasAuxMembers = false;

          // Invite user data
          var inviteUsersData = [];
          for(var inviteIndex in groupData.inviteUsers) {
             var invite = groupData.inviteUsers[inviteIndex];
             var inviteData = {};
             inviteData["create_conversation"] = invite.createConversation;
             inviteData["email"] = invite.email;
             inviteData["first_name"] = invite.firstName;
             inviteData["last_name"] = invite.lastName;
             if(invite.inviteMessage != null) {
               inviteData["invite_text"] = invite.inviteMessage;  // Only used when creating conversation
             }
             if(invite.auxId != null) {
               inviteData["aux_id"] = invite.auxId;
               hasAuxMembers = true;
             }
             inviteData["invite_type"] = invite.inviteType;
             inviteUsersData.push(inviteData);
          }

          // Group data
          var groupPostData = {};
          groupPostData["invite_users"] = inviteUsersData;
          groupPostData["members"] = groupData.memberIds;
          groupPostData["settings"] = settingsPostData;
          groupPostData["subject"] = groupData.subject;

          if(groupData.auxId != null) {
            groupPostData["aux_id"] = groupData.auxId;
            if(hasAuxMembers) {
              groupPostData["aux_members"] = true;
            }
          }

          var groupPostJson = JSON.stringify(groupPostData);
          var postUrl;
          if(groupData.auxId != null) {
            postUrl = "aux/groupchats";
          } else {
            postUrl = "groupchats";
          }
          this.post(postUrl, groupPostJson, callback, groupData.overrideToken);
        };

        sendMessage(messageData, callback) {
            var messagePostData = {};
            var methodPrefix = "";
            if(messageData.isAux) {
              methodPrefix += "aux/"
            }
            if(messageData.isGroup) {
              methodPrefix += "groupchats/";
            } else {
              methodPrefix += "conversations/";
            }
            if(messageData.attachmentPaths != null) {
              messagePostData["message"] = messageData.message;
              var postUrl = methodPrefix + messageData.chatId + "/attachments";
              this.postMultipart(postUrl, messagePostData, messageData.attachmentPaths, callback, messageData.overrideToken);
            } else {
              messagePostData["body"] = messageData.message;
              var messageJson = JSON.stringify(messagePostData);
              var postUrl = methodPrefix + messageData.chatId + "/messages";
              this.post(postUrl, messageJson, callback, messageData.overrideToken);
            }
        };


        /*
        *   Messenger API helper functions
        */

        http(url) {//, options) {
          return HttpClient.create(url);//, this.extend({}, this.globalHttpOptions, options));
        };

        get(getUrl, callback, overrideToken) {
          console.log("Messenger::get() >> " + getUrl);
          var token = overrideToken || this.apiToken;
          try {
            this.http(this.apiUrl + getUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').get()(function(err, resp, body) {
              if (resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                console.log("Messenger::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                var json = JSON.parse(body);
                callback(true, json);
              } else if (resp.statusCode === 302) {
                console.log("Messenger::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                var json = JSON.parse(body);
                var cookie = resp.headers["set-cookie"];
                callback(true, json, cookie);
              } else {
                console.error("Messenger::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                callback(false, null);
              }
            });
          } catch(exception) {
            console.error("Messenger::get() << " + getUrl + ": " + exception);
            callback(false, null);
          }
        }

        post(postUrl, postJson, callback, overrideToken) {
          console.log("Messenger::post() >> " + postUrl + ": " + postJson);
          var token = overrideToken || this.apiToken;
          try {
            this.http(this.apiUrl + postUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').post(postJson)(function(err, resp, body) {
              if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                console.log("Messenger::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                var json = JSON.parse(body);
                callback(true, json);
              } else {
                console.error("Messenger::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                callback(false, null);
              }
            });
          } catch(exception) {
                console.error("Messenger::post() << " + postUrl + ": " + exception);
                callback(false, null);
          }
        };

        postMultipart(postUrl, postData, attachmentPaths, callback, overrideToken) {
          console.log("Messenger::postMultipart() >> " + postUrl + " formData: " + postData + " attachmentPaths: ", attachmentPaths);
          var token = overrideToken || this.apiToken;
          // npm install --save form-data (https://github.com/form-data/form-data)
          var formData = new FormData();
          for(var propName in postData) {
            formData.append(propName, postData[propName]);
          }
          for(var i in attachmentPaths) {
            try {
              formData.append('files', FileSystem.createReadStream(attachmentPaths[i]));
            } catch(err) {
              console.error(err);
            }
          }
          var headers = formData.getHeaders();
          headers["Authorization"] = ("Bearer " + token);
          formData.submit({
            host: this.apiDomain,
            port: this.apiPort,
            protocol: this.apiProtocol + ":",
            path: "/" + this.apiVersion + "/" + postUrl,
            headers: headers}, function(err, res) {
              if(err != null) {
                console.error(err);
              }
              if(res == null) {
                callback(false, null);
                return;
              }
              var body = "";
              // Read incoming data
              res.on('readable', function() {
                body += res.read();
              });
              // Incoming data ended
              res.on('end', function() {
                if(res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204 || res.statusCode === 304) {
                  console.log("Messenger::postMultipart() << " + postUrl + ": " + res.statusCode + ": " + body);
                  var json = JSON.parse(body);
                  callback(true, json);
                } else {
                  console.error("Messenger::postMultipart() << " + postUrl + ": " + res.statusCode + ": " + body);
                  callback(false, null);
                }
              });
            });
        };

        download(url, name, mime, cookie, callback, overrideToken) {
          console.log("Messenger::download() >> " + url + " name: " + name + " mime: " + mime + " cookie: " + cookie);
          var token = overrideToken || this.apiToken;
          var auth = "Bearer " + token;

          var tmpDirPath = tmpDir + "/" + UuidV1();

          Mkdirp(tmpDirPath, function(mkdirError) {
            if(mkdirError != null) {
                console.log("Unable to create temporary folder: " + tmpDirPath)
                return;
            }

            var path = tmpDirPath + "/" + name;
            var req = Request({
              uri: url,
              method: 'get',
              headers: {
                  'Authorization': auth,
                  'Accept': mime,
                  'Cookie': cookie
              }
            });

            var res;

            req.on('response', function(response) {
              res = response;
            });

            req.on('error', function(err) {
              console.log("Messenger::download() << " + url + ": " + err);
              callback(false, null);
            });

            req.on('end', function() {
              if(res == null) {
                callback(false, null);
              } else if(res.statusCode == 200) {
                console.log("Messenger::download() << " + url + ": " + res.statusCode);
                callback(true, path);
              } else {
                console.error("Messenger::download() << " + url + ": " + res.statusCode);
                callback(false, null);
              }
            });

            req.pipe(FileSystem.createWriteStream(path));
          });
        };


        /*
        *   API destination settings
        */

        configure(protocol, domain, version, port, token) {
          this.apiProtocol = protocol;// = "https";
          this.apiDomain = domain;// = "localapi.alterdesk.com";
          this.apiVersion = version;// = "v1";
          this.apiPort = port;// = 443;
          this.apiUrl = protocol + "://" + domain + "/" + version + "/";
          this.apiToken = token;
          console.log("API Destination URL: " + this.apiUrl + " Token: " + token);

          var api = this;
          this.get("me", function(success, json) {
            if(success) {
              api.botCompanyId = json["company_id"];
              console.log("Bot company id: " + api.botCompanyId);
            } else {
              console.error("Unable to retrieve bot account");
            }
          });
        };


        /*
        *   Check if user has permission, can limit access to "everyone", "coworkers", "ids"
        */

        checkPermission(id, limitTo, limitIds, callback) {
          console.log("checkPermission: id: " + id + " limitTo: " + limitTo + " limitIds: " + limitIds);
          if(limitTo == "everyone") {
            callback(true);
          } else if(limitTo == "coworkers") {
            if(this.botCompanyId == null) {
              console.error("Bot company id not set on checkPermission");
              callback(false);
              return;
            }
            var api = this;
            this.get("users/" + id, function(success, json) {
              if(success) {
                var userCompanyId = json["company_id"];
                var isCoworker = api.botCompanyId == userCompanyId && userCompanyId != null;
                console.log("checkPermission: isCoworker: " + isCoworker + " bot: " + api.botCompanyId + " user: " + userCompanyId);
                callback(isCoworker);
              } else {
                console.error("Unable to retrieve user by id on checkPermission: " + id);
                callback(false);
              }
            });
          } else if(limitTo == "ids") {
            if(limitIds == null) {
              console.error("LimitIds null when using limit \"ids\" on checkPermission");
              callback(false);
              return;
            }
            for(var index in limitIds) {
              var limitId = limitIds[index];
              if(id == limitId) {
                console.log("Id found in allowed ids list on checkPermission");
                callback(true);
                return;
              }
            }
            console.log("Id not found in allowed ids list on checkPermission");
            callback(false);
          } else {
            console.error("Unknown limit on checkPermission: \"" + limitTo + "\"");
            callback(false);
          }
        };

        // Format data to encoded get parameters
        toGetParameters(data) {
           var parameters = "";
           var index = 0;
           for(var field in data) {
             if(index++ == 0) {
               parameters += "?";
             } else {
               parameters += "&";
             }
             parameters += encodeURIComponent(field) + "=" + encodeURIComponent(data[field]);
           };
           return parameters;
        };

        // Format a date to a timestamp
        dateToString(date) {
            return Moment(date).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z+00:00";
        };

        // Parse a timestamp to a date
        parseDate(dateString) {
            return Moment(dateString).unix();
        };
    },

    // Data container for inviting users
    InviteUserData: class {
        constructor() {
            this.createConversation = false;
        };
    },

    // Data container for creating group chats
    CreateGroupData: class {
        constructor() {
            // Users to invite
            this.inviteUsers = [];

            // Default thread settings
            this.allowContacts = true;
            this.autoCloseAfter = 0;
            this.autoExpireAfter = 0;
            this.hybridMessaging = false;
            this.membersCanInvite = false;
        };

        addInvite(inviteUserData) {
            this.inviteUsers.push(inviteUserData);
        };
    },

    // Data container for sending messages
    SendMessageData: class {
      constructor() {
        this.attachmentPaths = [];
      };

      addAttachmentPath(path) {
        this.attachmentPaths.push(path);
      };
    },

    // Data container for sending attachments
    AttachmentData: class {
    },

    // Data container for mentions
    MentionData: class {
    }
}