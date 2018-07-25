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
const Log = require('log');

// Set the log instance
var logger = new Log(process.env.NODE_MESSENGER_SDK_LOG_LEVEL || process.env.HUBOT_LOG_LEVEL || 'info');

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
            logger.error("Api::invite() Unknown invite type on invite: \"" + inviteUserData.inviteType + "\"")
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
                                logger.debug("Api::completeMentions() Ignored message user member as mention");
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
        logger.debug("Api::get() >> " + getUrl);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            logger.error("Api::get() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + getUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').get()(function(err, resp, body) {
                if(!resp) {
                    logger.error("Api::get() << " + getUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    logger.debug("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    var json = JSON.parse(body);
                    callback(true, json);
                } else if (resp.statusCode === 302) {
                    logger.debug("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    var json = JSON.parse(body);
                    var cookie = resp.headers["set-cookie"];
                    callback(true, json, cookie);
                } else {
                    logger.error("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            logger.error("Api::get() << " + getUrl + ": " + exception);
            callback(false, null);
        }
    }

    post(postUrl, postJson, callback, overrideToken) {
        logger.debug("Api::post() >> " + postUrl + ": " + postJson);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            logger.error("Api::post() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + postUrl).header('Authorization', 'Bearer ' + token).header('Content-Type', 'application/json; charset=UTF-8').post(postJson)(function(err, resp, body) {
                if(!resp) {
                    logger.error("Api::post() << " + getUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    logger.debug("Api::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                    var json = JSON.parse(body);
                    callback(true, json);
                } else {
                    logger.error("Api::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            Logger.error("Api::post() << " + postUrl + ": " + exception);
            callback(false, null);
        }
    }

    postMultipart(postUrl, postData, attachmentPaths, callback, overrideToken) {
        logger.debug("Api::postMultipart() >> " + postUrl + " formData: " + postData + " attachmentPaths: ", attachmentPaths);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            logger.error("Api::postMultipart() API token not set");
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
                    logger.error("Api::postMultipart() File does not exist: " + attachmentPath);
                    callback(false, null);
                    return;
                }
                var stat = FileSystem.statSync(attachmentPath);
                if(stat["size"] === 0) {
                    logger.error("Api::postMultipart() File is empty: " + attachmentPath);
                    callback(false, null);
                    return;
                }
                formData.append('files', FileSystem.createReadStream(attachmentPath));
            } catch(err) {
                logger.error("Api::postMultipart() Error reading file: " + attachmentPath, err);
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
                logger.debug("Api::postMultipart()  << " + postUrl + ": " + err);
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
                    logger.debug("Api::postMultipart()  << " + postUrl + ": " + res.statusCode + ": " + body);
                    var json = JSON.parse(body);
                    callback(true, json);
                } else {
                    logger.error("Api::postMultipart()  << " + postUrl + ": " + res.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        });
    }

    download(url, name, mime, cookie, callback, overrideToken) {
        logger.debug("Api::download() >> " + url + " name: " + name + " mime: " + mime + " cookie: " + cookie);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            logger.error("Api::download() API token not set");
            callback(false, null);
            return;
        }
        var auth = "Bearer " + token;

        var tmpDirPath = tmpDir + "/" + UuidV1();

        Mkdirp(tmpDirPath, function(mkdirError) {
            if(mkdirError != null) {
                logger.error("Api::download() Unable to create temporary folder: " + tmpDirPath)
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
                logger.debug("Api::download() << " + url + ": " + err);
                callback(false, null);
            });

            req.on('end', function() {
                if(res == null) {
                    callback(false, null);
                } else if(res.statusCode == 200) {
                    logger.debug("Api::download() << " + url + ": " + res.statusCode);
                    callback(true, path);
                } else {
                    logger.error("Api::download() << " + url + ": " + res.statusCode);
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
        logger.debug("Api::configure() URL: " + this.apiUrl + " Port: " + this.apiPort + " Token: " + this.apiToken);

        this.httpOptions = {};
        this.httpOptions.port = this.apiPort;

        if(this.apiToken == null || this.apiToken == "") {
            logger.error("Api::configure() No API token is set");
            return;
        }
    }

    isCoworker(userId, checkUser, callback) {
        logger.debug("Api::isCoworker() userId: " + userId);
        if(checkUser == null) {
            logger.error("Api::isCoworker() checkUser is null");
            callback(false);
            return;
        }
        this.isUserFromCompany(userId, checkUser.company_id, callback);
    }

    isUserFromCompany(userId, companyId, callback) {
        logger.debug("Api::isUserFromCompany() userId: " + userId + " companyId: " + companyId);
        if(userId == null) {
            logger.error("Api::isUserFromCompany() userId is null");
            callback(false);
            return;
        }
        if(companyId == null) {
            logger.error("Api::isUserFromCompany() companyId is null");
            callback(false);
            return;
        }
        var api = this;
        this.get("users/" + userId, function(success, json) {
            if(success) {
                var userCompanyId = json["company_id"];
                var isFromCompany = userCompanyId != null && companyId == userCompanyId;
                logger.debug("Api::isUserFromCompany() isUserFromCompany: " + isFromCompany + " companyId: " + userCompanyId);
                callback(isFromCompany);
            } else {
                logger.error("Api::isUserFromCompany() Unable to retrieve user by id: " + userId);
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