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



// Api connection class
class Api {

    /*
    *   High level messenger API helper functions
    */

    getAttachmentUrl(attachmentData, callback) {
        var getData = {};
        getData["headers"] = false;
        var methodPrefix = "";
        if(attachmentData.isAux) {
            methodPrefix += "aux/"
        }
        if(attachmentData.isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        this.get(methodPrefix + attachmentData.chatId + "/attachments/" + attachmentData.id + this.toGetParameters(getData), callback);
    }

    getChatPdfUrl(pdfData, callback) {
        var getData = {};
        if(pdfData.startDate != null) {
            getData["start_date"] = this.dateToString(pdfData.startDate);
        }
        if(pdfData.endDate != null) {
            getData["end_date"] = this.dateToString(pdfData.endDate);
        }
        getData["headers"] = false;
        var methodPrefix = "";
        if(pdfData.isAux) {
            methodPrefix += "aux/"
        }
        if(pdfData.isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        this.get(methodPrefix + pdfData.chatId + "/pdf" + this.toGetParameters(getData), callback);
    }

    invite(inviteUserData, callback) {
        var inviteData = {};
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
    }

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
    }

    getMessage(messageId, chatId, isGroup, isAux, callback) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        if(isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        this.get(methodPrefix + chatId + "/messages/" + messageId, callback);
    }

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
        var payloads = [];
        if(messageData.requestButtons) {
            var requestPayload = {};
        }
        if(payloads.length > 0) {
            messagePostData["payload"] = payloads;
        }
        if(messageData.attachmentPaths != null && messageData.attachmentPaths.length > 0) {
            messagePostData["message"] = messageData.message;
            var postUrl = methodPrefix + messageData.chatId + "/attachments";
            this.postMultipart(postUrl, messagePostData, messageData.attachmentPaths, callback, messageData.overrideToken);
        } else {
            messagePostData["body"] = messageData.message;

            if(messageData.payload) {
                var payload = messageData.payload;
                if(payload.type === "question" && payload.questionOptions && payload.questionOptions.length > 0) {
                    var questionOptions = [];
                    for(var i in payload.questionOptions) {
                        var option = payload.questionOptions[i];
                        if(option.label && option.name) {
                            var questionOption = {};
                            questionOption["style"] = option.style || "red";
                            questionOption["label"] = option.label;
                            questionOption["name"] = option.name;
                            questionOptions.push(questionOption);
                        }
                    }
                    if(questionOptions.length > 0) {
                        var questionPayload = {};
                        questionPayload["options"] = questionOptions;
                        questionPayload["multi_answer"] = payload.multiAnswer;
                        if(payload.style) {
                            questionPayload["style"] = payload.style;
                        }
                        if(payload.userIds && payload.userIds.length > 0) {
                            questionPayload["users"] = payload.userIds;
                        }
                        messagePostData["question"] = questionPayload;
                    }
                }
            }

            var messageJson = JSON.stringify(messagePostData);
            var postUrl = methodPrefix + messageData.chatId + "/messages";
            this.post(postUrl, messageJson, callback, messageData.overrideToken);
        }
    }

    getUserProviders(userId, callback) {
        this.get("users/" + userId + "/providers", callback);
    }

    getUserVerifications(userId, callback) {
        this.get("users/" + userId + "/verifications", callback);
    }

    askUserVerification(userId, providerId, chatId, isGroup, isAux, callback) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        if(isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        var postUrl = methodPrefix + chatId + "/verification";
        var postData = {};
        postData["user_id"] = userId;
        postData["provider_id"] = providerId;
        var postJson = JSON.stringify(postData);
        this.post(postUrl, postJson, callback);
    }

    completeMentions(mentions, excludeIds, chatId, isGroup, isAux, callback) {
        var mentionedMembers = [];
        var userIds = [];
        var mentionedAll = false;
        for(var index in mentions) {
            var mention = mentions[index];
            var id = mention["id"];
            if(id.toUpperCase() === "@ALL") {
                mentionedAll = true;
                break;
            }
            if(!mention["first_name"] || !mention["last_name"]) {
                var exclude = false;
                if(excludeIds != null) {
                    for(var i in excludeIds) {
                        if(mention["id"] === excludeIds[i]) {
                            exclude = true;
                            break;
                        }
                    }
                    if(exclude) {
                        continue;
                    }
                }
                userIds.push(id);
            } else {
                mentionedMembers.push(mention);
            }
        }
        if(mentionedAll && isGroup) {
            var url = "";
            if(isAux) {
                url += "aux/"
            }
            url += "groupchats/" + chatId + "/members";
            this.get(url, function(success, json) {
                if(success) {
                    for(var index in json) {
                        var member = json[index];
                        var exclude = false;
                        if(excludeIds != null) {
                            for(var i in excludeIds) {
                                if(member["id"] === excludeIds[i]) {
                                    exclude = true;
                                    break;
                                }
                            }
                            if(exclude) {
                                console.log("Ignored message user member as mention");
                                continue;
                            }
                        }
                        mentionedMembers.push(member);
                    }
                }
                callback(mentionedMembers);
            });
        } else if(userIds.length > 0) {
            for(var index in userIds) {
                this.get("users/" + userIds[index], function(success, json) {
                    if(success) {
                        mentionedMembers.push(json);
                    }
                    if(index + 1 >= userIds.length) {
                        callback(mentionedMembers);
                    }
                });
            }
        } else {
            callback(mentionedMembers);
        }
    }

    /*
    *   Messenger API helper functions
    */

    http(url) {
        return HttpClient.create(url, this.httpOptions);
    }

    get(getUrl, callback, overrideToken) {
        console.log("Messenger::get() >> " + getUrl);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            console.error("API token not set on Messenger::get()");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + getUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').get()(function(err, resp, body) {
                if(!resp) {
                    console.error("Messenger::get() << " + getUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
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
        if(token == null || token == "") {
            console.error("API token not set on Messenger::post()");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + postUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').post(postJson)(function(err, resp, body) {
                if(!resp) {
                    console.error("Messenger::post() << " + getUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
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
    }

    postMultipart(postUrl, postData, attachmentPaths, callback, overrideToken) {
        console.log("Messenger::postMultipart() >> " + postUrl + " formData: " + postData + " attachmentPaths: ", attachmentPaths);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            console.error("API token not set on Messenger::postMultipart()");
            callback(false, null);
            return;
        }
        var formData = new FormData();
        for(var propName in postData) {
            formData.append(propName, postData[propName]);
        }
        for(var i in attachmentPaths) {
            var attachmentPath = attachmentPaths[i];
            try {
                if(!FileSystem.existsSync(attachmentPath)) {
                    console.error("File does not exist: " + attachmentPath);
                    callback(false, null);
                    return;
                }
                var stat = FileSystem.statSync(attachmentPath);
                if(stat["size"] === 0) {
                    console.error("File is empty: " + attachmentPath);
                    callback(false, null);
                    return;
                }
                formData.append('files', FileSystem.createReadStream(attachmentPath));
            } catch(err) {
                console.error("Error reading file: " + attachmentPath, err);
                callback(false, null);
                return;
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
            if(res == null) {
                console.log("Messenger::postMultipart() << " + postUrl + ": " + err);
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
    }

    download(url, name, mime, cookie, callback, overrideToken) {
        console.log("Messenger::download() >> " + url + " name: " + name + " mime: " + mime + " cookie: " + cookie);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            console.error("API token not set on Messenger::download()");
            callback(false, null);
            return;
        }
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
    }

    /*
    *   API destination settings
    */

    configure(token, protocol, domain, version, port) {
        this.apiToken = token || process.env.NODE_ALTERDESK_TOKEN;
        this.apiProtocol = protocol || process.env.NODE_ALTERDESK_TRANSPORT || "https";
        this.apiDomain = domain || process.env.NODE_ALTERDESK_DOMAIN || "api.alterdesk.com";
        this.apiVersion = version || process.env.NODE_ALTERDESK_VERSION || "v1";
        this.apiPort = port || process.env.NODE_ALTERDESK_PORT || 443;
        this.apiUrl = this.apiProtocol + "://" + this.apiDomain + "/" + this.apiVersion + "/";
        console.log("API Destination URL: " + this.apiUrl + " Port: " + this.apiPort + " Token: " + this.apiToken);

        this.httpOptions = {};
        this.httpOptions.port = this.apiPort;

        if(this.apiToken == null || this.apiToken == "") {
            console.error("No API token is set on Messenger::configure()");
            return;
        }

        // TODO Remove section when all bots are using isCoworker() or isUserFromCompany()
        var api = this;
        this.get("me", function(success, json) {
            if(success) {
                api.companyId = json["company_id"];
                console.log("Bot company id: " + api.companyId);
            } else {
                console.error("Unable to retrieve bot account");
            }
        });
    }


    /*
    *   Check if user has permission, can limit access to "everyone", "coworkers", "ids"
    */
    // TODO Remove function when all bots are using isCoworker() or isUserFromCompany()
    checkPermission(id, limitTo, limitIds, callback) {
        console.error("Deprecated function \"checkPermission\", please use isCoworker() or isUserFromCompany() instead");
        console.log("checkPermission: id: " + id + " limitTo: " + limitTo + " limitIds: " + limitIds);
        if(limitTo == "everyone") {
            callback(true);
        } else if(limitTo == "coworkers") {
            if(this.companyId == null) {
                console.error("Company id not set on checkPermission");
                callback(false);
                return;
            }
            var api = this;
            this.get("users/" + id, function(success, json) {
                if(success) {
                    var userCompanyId = json["company_id"];
                    var isCoworker = api.companyId == userCompanyId && userCompanyId != null;
                    console.log("checkPermission: isCoworker: " + isCoworker + " bot: " + api.companyId + " user: " + userCompanyId);
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
    }

    isCoworker(userId, checkUser, callback) {
        if(checkUser == null) {
            console.error("checkUser is null on isCoworker");
            callback(false);
            return;
        }
        this.isUserFromCompany(userId, checkUser.company_id, callback);
    }

    isUserFromCompany(userId, companyId, callback) {
        if(userId == null) {
            console.error("userId is null on isUserFromCompany");
            callback(false);
            return;
        }
        if(companyId == null) {
            console.error("companyId is null on isUserFromCompany");
            callback(false);
            return;
        }
        var api = this;
        this.get("users/" + userId, function(success, json) {
            if(success) {
                var userCompanyId = json["company_id"];
                var isFromCompany = userCompanyId != null && companyId == userCompanyId;
                console.log("isUserFromCompany: " + isFromCompany + " companyId: " + userCompanyId);
                callback(isFromCompany);
            } else {
                console.error("Unable to retrieve user by id on isUserFromCompany: " + userId);
                callback(false);
            }
        });
    }

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
    }

    // Format a date to a timestamp
    dateToString(date) {
        return Moment(date).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z+00:00";
    }

    // Parse a timestamp to a date
    parseDate(dateString) {
        return Moment(dateString).unix();
    }
}

// Data container for inviting users
class InviteUserData {
    constructor() {
        this.createConversation = false;
    }
}

// Data container for creating group chats
class CreateGroupData {
    constructor() {
        // Members to add
        this.memberIds = [];

        // Users to invite
        this.inviteUsers = [];

        // Default thread settings
        this.allowContacts = true;
        this.autoCloseAfter = 0;
        this.autoExpireAfter = 0;
        this.hybridMessaging = false;
        this.membersCanInvite = true;
    }

    addMemberId(id) {
        this.memberIds.push(id);
    }

    addMemberIds(ids) {
        for(var index in ids) {
            this.addMemberId(ids[index]);
        }
    }

    addInvite(invite) {
        this.inviteUsers.push(invite);
    }

    addInvites(invites) {
        for(var index in invites) {
            this.addInvite(invites[index]);
        }
    }
}

class QuestionOption {
}

class QuestionPayload {
    constructor() {
        this.type = "question";
        this.questionOptions = [];
        this.userIds = [];
    }

    addQuestionOption(questionOption) {
        this.questionOptions.push(questionOption);
    }

    addOption(name, label, style) {
        var option = new QuestionOption();
        option.name = name;
        option.label = label;
        option.style = style;
        this.addQuestionOption(option);
    }

    addUserId(userId) {
        this.userIds.push(userId);
    }

    addUserIds(userIds) {
        for(var index in userIds) {
            this.addUserId(userIds[index]);
        }
    }
}

// Data container for sending messages
class SendMessageData {
    constructor() {
        this.attachmentPaths = [];
    }

    addAttachmentPath(path) {
        this.attachmentPaths.push(path);
    }

    addAttachmentPaths(paths) {
        for(var index in paths) {
            this.addAttachmentPath(paths[index]);
        }
    }

    addRequestButtons(requestButtons) {
        this.requestButtons = requestButtons;
    }
}

// Data container for sending/downloading attachments
class AttachmentData {
}

// Data container for downloading chat pdf
class PdfData {
}

// Data container for mentions
class MentionData {
}

module.exports = {

    Api : Api,
    InviteUserData : InviteUserData,
    CreateGroupData : CreateGroupData,
    QuestionOption : QuestionOption,
    QuestionPayload : QuestionPayload,
    SendMessageData : SendMessageData,
    AttachmentData : AttachmentData,
    PdfData : PdfData,
    MentionData : MentionData

}