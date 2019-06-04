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
const FormData = require('form-data');
const HttpClient = require('scoped-http-client');
const UuidV1 = require('uuid/v1');
const Moment = require('moment');
const FileSystem = require('fs');
const Mkdirp = require('mkdirp');
const Request = require('request');
const Path = require('path');
const OS = require('os');
const Log = require('log');

// Set the log instance
const Logger = new Log(process.env.NODE_MESSENGER_SDK_LOG_LEVEL || process.env.HUBOT_LOG_LEVEL || 'debug');

const tmpDownloadDir = Path.resolve(OS.tmpdir(), 'messenger-downloads');
const tmpUploadDir = Path.resolve(OS.tmpdir(), 'messenger-uploads');


// Api connection class
class Api {

    /*
    *   High level messenger API helper functions
    */

    downloadAttachment(attachment, chatId, isGroup, isAux) {
        return new Promise(async (resolve) => {
            try {
                Logger.debug("Api::downloadAttachment() ", attachment);
                var attachmentData = new AttachmentData();
                attachmentData.id = attachment["id"];
                attachmentData.name = attachment["name"];
                attachmentData.mime = attachment["mime_type"];
                attachmentData.chatId = chatId;
                attachmentData.isGroup = isGroup;
                attachmentData.isAux = isAux;
                this.getAttachmentUrl(attachmentData, (urlSuccess, urlJson, urlCookie) => {
                    if(!urlSuccess) {
                        Logger.error("Api::downloadAttachment() Unable to retrieve download url:", attachment);
                        resolve(null);
                        return;
                    }
                    var url = urlJson["link"];
                    this.download(url, attachmentData.name, attachmentData.mime, urlCookie, (downloadSuccess, downloadPath) => {
                        if(!downloadSuccess) {
                            Logger.error("Api::downloadAttachment() Unable to download attachment:", url, attachment);
                            resolve(null);
                            return;
                        }
                        Logger.debug("Api:downloadAttachment() Downloaded at " + downloadPath);
                        resolve(downloadPath);
                    });
                });
            } catch(err) {
                Logger.error(err);
                resolve(null);
            }
        });
    }

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
        this.get(methodPrefix + encodeURIComponent(attachmentData.chatId) + "/attachments/" + attachmentData.id + this.toGetParameters(getData), callback, attachmentData.overrideToken);
    }

    downloadChatPdf(filename, startDate, endDate, chatId, isGroup, isAux) {
        return new Promise(async (resolve) => {
            try {
                Logger.debug("Api::downloadChatPdf()");
                var pdfData = new PdfData();
                pdfData.startDate = startDate;
                pdfData.endDate = endDate;
                pdfData.chatId = chatId;
                pdfData.isGroup = isGroup;
                pdfData.isAux = isAux;
                this.getChatPdfUrl(pdfData, (urlSuccess, urlJson, urlCookie) => {
                    if(!urlSuccess) {
                        Logger.error("Api::downloadChatPdf() Unable to retrieve download url");
                        resolve(null);
                        return;
                    }
                    var url = urlJson["link"];
                    this.download(url, filename, "application/pdf", urlCookie, (downloadSuccess, downloadPath) => {
                        if(!downloadSuccess) {
                            Logger.error("Api::downloadChatPdf() Unable to download pdf:", url);
                            resolve(null);
                            return;
                        }
                        Logger.debug("Api:downloadChatPdf() Downloaded at " + downloadPath);
                        resolve(downloadPath);
                    });
                });
            } catch(err) {
                Logger.error(err);
                resolve(null);
            }
        });
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
        this.get(methodPrefix + encodeURIComponent(pdfData.chatId) + "/pdf" + this.toGetParameters(getData), callback, pdfData.overrideToken);
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
        if(inviteUserData.sendEmail != null) {
            inviteData["send_email"] = inviteUserData.sendEmail;
        }
        if(inviteUsersData.auxId != null) {
            inviteData["aux_id"] = inviteUsersData.auxId;
        }
        var invitePostJson = JSON.stringify(inviteData);

        if(inviteUserData.inviteType == "coworker") {
            this.post("users/invite/coworker", invitePostJson, callback, inviteUsersData.overrideToken);
        } else if(inviteUserData.inviteType == "contact") {
            this.post("users/invite/contact", invitePostJson, callback, inviteUsersData.overrideToken);
        } else if(inviteUserData.inviteType == "private_user") {
            this.post("users/invite/private", invitePostJson, callback, inviteUsersData.overrideToken);
        } else {
            Logger.error("Api::invite() Unknown invite type on invite: \"" + inviteUserData.inviteType + "\"")
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

        if(groupData.sendEmail != null) {
            groupPostData["send_email"] = groupData.sendEmail;
        }

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

    getGroupMembers(groupId, isAux, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        this.get(methodPrefix + "groupchats/" + encodeURIComponent(groupId) + "/members", callback, overrideToken);
    }

    addGroupMembers(groupId, isAux, userIds, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        var memberPutData = {};
        memberPutData["members"] = userIds;
//        memberPutData["aux_members"] = false; TODO
        var memberPutJson = JSON.stringify(memberPutData);
        this.put(methodPrefix + "groupchats/" + encodeURIComponent(groupId) + "/members", memberPutJson, callback, overrideToken);
    }

    removeGroupMembers(groupId, isAux, userIds, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        var memberDeleteData = {};
        memberDeleteData["members"] = userIds;
//        memberDeleteData["aux_members"] = false; TODO
        var memberDeleteJson = JSON.stringify(memberDeleteData);
        this.delete(methodPrefix + "groupchats/" + encodeURIComponent(groupId) + "/members", memberDeleteJson, callback, overrideToken);
    }

    changeGroupSubject(groupId, isAux, subject, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        var subjectPostData = {};
        subjectPostData["subject"] = subject;
        var subjectPostJson = JSON.stringify(subjectPostData);
        this.put(methodPrefix + "groupchats/" + encodeURIComponent(groupId), subjectPostJson, callback, overrideToken);
    }

    changeGroupSettings(groupId, isAux, groupSettingsData, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        var settingsPostData = {};
        if(groupData.allowContacts != null) {
            settingsPostData["allow_contacts"] = groupData.allowContacts;
        }
        if(groupData.autoCloseAfter != null) {
            settingsPostData["auto_close_after"] = groupData.autoCloseAfter;
        }
        if(groupData.autoExpireAfter != null) {
            settingsPostData["auto_expire_after"] = groupData.autoExpireAfter;
        }
        if(groupData.hybridMessaging != null) {
            settingsPostData["hybrid_messaging"] = groupData.hybridMessaging;
        }
        if(groupData.membersCanInvite != null) {
            settingsPostData["members_can_invite"] = groupData.membersCanInvite;
        }
        var settingsPostJson = JSON.stringify(settingsPostData);
        this.put(methodPrefix + "groupchats/" + encodeURIComponent(groupId) + "/settings", settingsPostJson, callback, overrideToken);
    }

    changeGroupAvatar(groupId, isAux, avatarPath, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        var postUrl = methodPrefix + "groupchats/" + encodeURIComponent(groupId) + "/avatar";
        this.postMultipart(postUrl, null, "avatar", [avatarPath], callback, overrideToken);
    }

    closeGroupChat(groupId, isAux, sendEmail, callback, overrideToken) {
        var closePostData = {};
        closePostData["send_email"] = sendEmail;
        var closePostJson = JSON.stringify(closePostData);

        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        this.delete(methodPrefix + "groupchats/" + encodeURIComponent(groupId), closePostJson, callback, overrideToken);
    }

    getChat(chatId, isGroup, isAux, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        if(isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        this.get(methodPrefix + encodeURIComponent(chatId), callback, overrideToken);
    }

    getUser(userId, isAux, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        this.get(methodPrefix + "users/" + encodeURIComponent(userId), callback, overrideToken);
    }

    getMessage(messageId, chatId, isGroup, isAux, callback, overrideToken) {
        var methodPrefix = "";
        if(isAux) {
            methodPrefix += "aux/"
        }
        if(isGroup) {
            methodPrefix += "groupchats/";
        } else {
            methodPrefix += "conversations/";
        }
        this.get(methodPrefix + encodeURIComponent(chatId) + "/messages/" + messageId, callback, overrideToken);
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
            this.postMultipart(postUrl, messagePostData, "files", messageData.attachmentPaths, callback, messageData.overrideToken);
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

    getUserProviders(userId, callback, overrideToken) {
        this.get("users/" + userId + "/providers", callback, overrideToken);
    }

    getUserVerifications(userId, callback, overrideToken) {
        this.get("users/" + userId + "/verifications", callback, overrideToken);
    }

    askUserVerification(userId, providerId, chatId, isGroup, isAux, callback, overrideToken) {
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
        this.post(postUrl, postJson, callback, overrideToken);
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
                                Logger.debug("Api::completeMentions() Ignored message user member as mention");
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

    http(url, token) {
        return HttpClient.create(url, this.httpOptions)
        .header('Authorization', 'Bearer ' + token)
        .header('Content-Type', 'application/json; charset=UTF-8');
    }

    delete(deleteUrl, deleteJson, callback, overrideToken) {
        Logger.debug("Api::delete() >> " + deleteUrl + ": " + deleteJson);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::delete() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + deleteUrl, token).delete(deleteJson)((err, resp, body) => {
                if(!resp) {
                    Logger.error("Api::delete() << " + deleteUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    Logger.debug("Api::delete() << " + deleteUrl + ": " + resp.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    callback(true, json);
                } else {
                    Logger.error("Api::delete() << " + deleteUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            Logger.error("Api::delete() << " + deleteUrl + ": " + exception);
            callback(false, null);
        }
    }

    get(getUrl, callback, overrideToken) {
        Logger.debug("Api::get() >> " + getUrl);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::get() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + getUrl, token).get()((err, resp, body) => {
                if(!resp) {
                    Logger.error("Api::get() << " + getUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    Logger.debug("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    callback(true, json);
                } else if (resp.statusCode === 302) {
                    Logger.debug("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    var cookie = resp.headers["set-cookie"];
                    callback(true, json, cookie);
                } else {
                    Logger.error("Api::get() << " + getUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            Logger.error("Api::get() << " + getUrl + ": " + exception);
            callback(false, null);
        }
    }

    post(postUrl, postJson, callback, overrideToken) {
        Logger.debug("Api::post() >> " + postUrl + ": " + postJson);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::post() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + postUrl, token).post(postJson)((err, resp, body) => {
                if(!resp) {
                    Logger.error("Api::post() << " + postUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    Logger.debug("Api::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    callback(true, json);
                } else {
                    Logger.error("Api::post() << " + postUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            Logger.error("Api::post() << " + postUrl + ": " + exception);
            callback(false, null);
        }
    }

    postMultipart(postUrl, postData, fileParameter, filePaths, callback, overrideToken) {
        Logger.debug("Api::postMultipart() >> " + postUrl + " formData: " + postData + " filePaths: ", filePaths);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::postMultipart() API token not set");
            callback(false, null);
            return;
        }
        var formData = new FormData();
        if(postData) {
            for(var propName in postData) {
                formData.append(propName, postData[propName]);
            }
        }
        for(var i in filePaths) {
            var filePath = filePaths[i];
            try {
                if(!FileSystem.existsSync(filePath)) {
                    Logger.error("Api::postMultipart() File does not exist: " + filePath);
                    callback(false, null);
                    return;
                }
                var stat = FileSystem.statSync(filePath);
                if(stat["size"] === 0) {
                    Logger.error("Api::postMultipart() File is empty: " + filePath);
                    callback(false, null);
                    return;
                }
                formData.append(fileParameter, FileSystem.createReadStream(filePath));
            } catch(err) {
                Logger.error("Api::postMultipart() Error reading file: " + filePath, err);
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
            if(err || res == null) {
                Logger.debug("Api::postMultipart() << " + postUrl + ": " + err);
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
                    Logger.debug("Api::postMultipart() << " + postUrl + ": " + res.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    callback(true, json);
                } else {
                    Logger.error("Api::postMultipart() << " + postUrl + ": " + res.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        });
    }

    put(putUrl, putJson, callback, overrideToken) {
        Logger.debug("Api::put() >> " + putUrl + ": " + putJson);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::put() API token not set");
            callback(false, null);
            return;
        }
        try {
            this.http(this.apiUrl + putUrl, token).put(putJson)((err, resp, body) => {
                if(!resp) {
                    Logger.error("Api::put() << " + putUrl + ": " + err);
                    callback(false, null);
                } else if(resp.statusCode === 200 || resp.statusCode === 201 || resp.statusCode === 204 || resp.statusCode === 304) {
                    Logger.debug("Api::put() << " + putUrl + ": " + resp.statusCode + ": " + body);
                    var json;
                    if(body && body !== "") {
                        json = JSON.parse(body);
                    }
                    callback(true, json);
                } else {
                    Logger.error("Api::put() << " + putUrl + ": " + resp.statusCode + ": " + body);
                    callback(false, null);
                }
            });
        } catch(exception) {
            Logger.error("Api::put() << " + putUrl + ": " + exception);
            callback(false, null);
        }
    }

    getTmpDownloadPath(callback) {
        var tmpDownloadPath = tmpDownloadDir + "/" + UuidV1();
        Mkdirp(tmpDownloadPath, (mkdirError) => {
            if(mkdirError != null) {
                Logger.error("Api::getTmpDownloadPath() Unable to create temporary folder: " + tmpDownloadPath)
                callback(false, null);
                return;
            }
            callback(true, tmpDownloadPath);
        });
    }

    getTmpUploadPath(callback) {
        var tmpUploadPath = tmpUploadDir + "/" + UuidV1();
        Mkdirp(tmpUploadPath, (mkdirError) => {
            if(mkdirError != null) {
                Logger.error("Api::getTmpUploadPath() Unable to create temporary folder: " + tmpUploadPath)
                callback(false, null);
                return;
            }
            callback(true, tmpUploadPath);
        });
    }

    download(url, name, mime, cookie, callback, overrideToken) {
        Logger.debug("Api::download() >> " + url + " name: " + name + " mime: " + mime + " cookie: " + cookie);
        var token = overrideToken || this.apiToken;
        if(token == null || token == "") {
            Logger.error("Api::download() API token not set");
            callback(false, null);
            return;
        }
        var auth = "Bearer " + token;

        this.getTmpDownloadPath((success, tmpDownloadPath) => {
            if(!success) {
                Logger.error("Api::download() Unable to create temporary folder: " + tmpDownloadPath)
                return;
            }

            var path = tmpDownloadPath + "/" + name;
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
                Logger.debug("Api::download() << " + url + ": " + err);
                callback(false, null);
            });

            req.on('end', function() {
                if(res == null) {
                    callback(false, null);
                } else if(res.statusCode == 200) {
                    Logger.debug("Api::download() << " + url + ": " + res.statusCode);
                    callback(true, path);
                } else {
                    Logger.error("Api::download() << " + url + ": " + res.statusCode);
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
        Logger.debug("Api::configure() URL: " + this.apiUrl + " Port: " + this.apiPort + " Token: " + this.apiToken);

        this.httpOptions = {};
        this.httpOptions.port = this.apiPort;

        if(this.apiToken == null || this.apiToken == "") {
            Logger.error("Api::configure() No API token is set");
            return;
        }
    }

    isCoworker(userId, checkUser, callback) {
        Logger.debug("Api::isCoworker() userId: " + userId);
        if(checkUser == null) {
            Logger.error("Api::isCoworker() checkUser is null");
            callback(false);
            return;
        }
        this.isUserFromCompany(userId, checkUser.company_id, callback);
    }

    isUserFromCompany(userId, companyId, callback) {
        Logger.debug("Api::isUserFromCompany() userId: " + userId + " companyId: " + companyId);
        if(userId == null) {
            Logger.error("Api::isUserFromCompany() userId is null");
            callback(false);
            return;
        }
        if(companyId == null) {
            Logger.error("Api::isUserFromCompany() companyId is null");
            callback(false);
            return;
        }
        var api = this;
        this.get("users/" + userId, function(success, json) {
            if(success) {
                var userCompanyId = json["company_id"];
                var isFromCompany = userCompanyId != null && companyId == userCompanyId;
                Logger.debug("Api::isUserFromCompany() isUserFromCompany: " + isFromCompany + " companyId: " + userCompanyId);
                callback(isFromCompany);
            } else {
                Logger.error("Api::isUserFromCompany() Unable to retrieve user by id: " + userId);
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

class GroupSettingsData {
    constructor() {
        this.allowContacts = null; //true;
        this.autoCloseAfter = null; //0;
        this.autoExpireAfter = null; //0;
        this.hybridMessaging = null; //false;
        this.membersCanInvite = null; //true;
    }

    setAllowContacts(allow) {
        this.allowContacts = allow;
    }

    setCloseAfter(after) {
        this.autoCloseAfter = after;
    }

    setExpireAfter(after) {
        this.autoExpireAfter = after;
    }

    setHybridMessaging(hybrid) {
        this.hybridMessaging = hybrid;
    }

    setMembersCanInvite(invite) {
        this.membersCanInvite = invite;
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