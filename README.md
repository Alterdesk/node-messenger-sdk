# Node Messenger SDK
Messenger SDK for [API](https://api.alterdesk.com/documentation) calls from a node project.

## Using the Messenger API
### Initialize Messenger API
Create a Messenger API instance, the constructor needs the following
* API protocol *(default: "https")*
* API domain *(default: "api.alterdesk.com")*
* API version *(default: "v1")*
* API port *(default: "443")*
* API OAuth 2.0 token

```javascript
messengerApi = new Messenger.Api();
messengerApi.configure("https", "api.alterdesk.com", "v1", 443, "<ALTERDESK_API_TOKEN>");
```

### Send a message
Send a message with or without attachments in to a chat
```javascript
// Create a message data instance
var messageData = new Messenger.SendMessageData();

// Text body of the message
messageData.message = "My message text";
// Optional attachments to send(local absolute or relative paths)
messageData.addAttachmentPath("myAttachment.pdf");
// Chat id to send the message in
messageData.chatId = chatId;
// If the chat is a group chat or a one-to-one chat
messageData.isGroup = isChatGroup;
// Optional auxiliary id for the chat
messageData.isAux = isChatAux;
// Use an alternative API token for this call (optional)
messageData.overrideToken = "<OPTIONAL_ALTERNATIVE_API_TOKEN>";

// Send the message and parse result in callback
messengerApi.sendMessage(messageData, function(success, json) {
    console.log("Send message successful: " + success);
    if(json != null) {
        var messageId = json["id"];
    }
});
```

### Invite a user
To invite a coworker, contact or private user onto the messenger
```javascript
// Create a invite user data instance
var inviteData = new Messenger.InviteUserData();

// First name of the user (optional)
inviteData.firstName = answers.firstName;
// Last name of the user (optional)
inviteData.lastName = answers.lastName;
// Invite type (coworker, contact or private_user)
inviteData.inviteType = "private_user";
// Optional auxiliary id for the user
inviteData.auxId = id;
```

Invite the user by email
```javascript
// Email adress to send invite to
inviteData.email = answers.email;
```

Or Invite the user by SMS *(Not available yet through API)*
```javascript
// Phone number to send invite SMS
inviteData.phoneNumber = answers.phoneNumber;
```

To invite a user for a one-to-one chat use the following
````javascript
// Send a message with the invite (optional)
inviteData.inviteMessage = answers.inviteMessage;

// Invite the user and parse result in callback
messengerApi.invite(inviteData, function(success, function(success, json) {
    console.log("Invite user successful: " + success);
    if(json != null) {
        var userId = json["id"];
    }
});
````

When inviting a user for a group chat, set the following fields and use createGroup()
```javascript
// Create a one-to-one chat for this user
inviteData.createConversation = false;

// Invite users in the group (see "Create a group chat" below)
groupData.addInvite(inviteData);
```

### Create a group chat
```javascript
// Create a group data instance
var groupData = new Messenger.CreateGroupData();

// Set the chat subject
groupData.subject = "My chat name"
// Set an auxiliary id for this chat
groupData.auxId = "<MY_AUX_ID>"
// Optional members to add
groupData.memberIds = ["<MEMBER_ID_1>", "<MEMBER_ID_2>", "<MEMBER_ID_3>"];
// Allow contacts in the group (optional)
groupData.allowContacts = true;
// Automatically close the group after 7 days of inactivity (optional)
groupData.autoCloseAfter = 7;
// Messages expire after 600 seconds(10 minutes) (optional)
groupData.autoExpireAfter = 600;
// Use hybrid messaging (optional)
groupData.hybridMessaging = false;
// All members can invite other members (optional)
groupData.membersCanInvite = true;
// Invite users in the group (optional)
groupData.addInvite(inviteData);
// Use an alternative API token for this call (optional)
groupData.overrideToken = "<OPTIONAL_ALTERNATIVE_API_TOKEN>";

// Create the group chat and parse result in callback
messengerApi.createGroup(groupData, function(success, json) {
    console.log("Create group successful: " + success);
    if(json != null) {
        var groupId = json["id"];
    }
});
```

### Download an attachment
```javascript
// Create an attachment data instance
var attachmentData = new Messenger.AttachmentData();

// Attachment id
attachmentData.id = "<ATTACHMENT_ID>";
// Chat id
attachmentData.chatId = "<CHAT_ID>";
// Is the chat a group
attachmentData.isGroup = true;
// Is it an auxiliary chat
attachmentData.isAux = false;
// Filename of the downloaded attachment
attachmentData.name = "picture.png";
// MIME type of the attachment
attachmentData.mime = "image/png";

// Retrieve attachment download url
messengerApi.getAttachmentUrl(attachmentData, function(success, json, cookie) {
    console.log("Retrieve attachment download url successful: " + success);
    if(json != null && cookie != null) {
        var url = json["link"];
        var name = attachmentData.name;
        var mime = attachmentData.mime;
        messengerApi.download(url, name, mime, cookie, function(downloaded, path) {
            if(downloaded) {
                console.log("attachment: Path: " + path);
                attachmentData.path = path;
            }
        });
    }
});
```

### Download chat in pdf format
```javascript
// Create a PDF data instance
var pdfData = new Messenger.PdfData();

// Chat id
pdfData.chatId = "<CHAT_ID>";
// Is the chat a group
pdfData.isGroup = false;
// Is auxiliary chat
pdfData.isAux = true;
// Starting date of generated PDF
pdfData.startDate = messengerApi.parseDate("2017-12-31T13:05:32");
// Ending date of generated PDF
pdfData.endDate = null;
// Filename of the downloaded pdf
pdfData.name = "chatLog.pdf";

// Retrieve chat pdf download url
messengerApi.getChatPdfUrl(pdfData, function(success, json, cookie) {
    console.log("Retrieve pdf download url successful: " + success);
    if(json != null) {
        var url = json["link"];
        messengerApi.download(url, pdfData.name, "application/pdf", cookie, function(downloaded, path) {
            if(downloaded) {
                console.log("pdf: Path: " + path);
                pdfData.path = path;
            }
        }
    }
});
```

### Using other API functions
The [API](https://api.alterdesk.com/documentation) has more functions than described above, below are some example
usages of get(), post() and postMultipart();

#### Get
Get has the following parameters
* URL
* Callback function
* Override OAuth 2.0 token *(optional)*

Retrieve a user *(GET)*
```javascript
this.get("users/" + "<USER_ID>", function(success, json) {
    if(json != null) {
        // Parse result
    }                                    
});
```

Retrieve a page of contacts *(GET with parameters)*
```javascript
var getData = {};
getData["page"] = 0;
getData["amount"] = 20;
this.get("me/contacts" + control.toGetParameters(getData), function(success, json) {
   if(json != null) {
       // Parse result
   }                                    
});
```

#### Post
Post has the following parameters
* URL
* JSON parameter string
* Callback function
* Override OAuth 2.0 token *(optional)*

Import list of users *(POST)*
```javascript
// Create invite data to import
var inviteOne = {};
inviteOne["email"] = "one@example.com";
inviteOne["first_name"] = "firstOne";
inviteOne["last_name"] = "lastOne";
inviteOne["saml_username"] = "samlOne";
inviteOne["username"] = "usernameOne";
var inviteTwo = {};
inviteTwo["email"] = "two@example.com";
inviteTwo["first_name"] = "firstTwo";
inviteTwo["last_name"] = "lastTwo";
inviteTwo["saml_username"] = "samlTwo";
inviteTwo["username"] = "usernameTwo";
// Add invite data to an array
var invites = [];
invites.push(inviteOne);
invites.push(inviteTwo);
// Post data object
var postData = {};
// Send the imported users an email
postData["send_email"] = false;
// Add the created invites list
postData["users"] = invites;
// Create JSON string from data object
var postJson = JSON.stringify(postData);
this.post("company/import", postJson, function(success, json) {
    if(json != null) {
        // Parse result
    }                                    
});
```

#### Post Multipart
Post has the following parameters
* URL
* Post data object
* File path array
* Callback function
* Override OAuth 2.0 token *(optional)*

Send attachment message *(demonstrative purposes only, please use sendMessage() instead)*
```javascript
// Chat id
var chatId = "<CHAT_ID>";
// Attachment paths to upload
var filePaths = [];
var filePaths.push("localFolder/firstAttachment.png");
var filePaths.push("localFolder/secondAttachment.doc");
// Post data object
var postData = {};
// Text body of message
postData["message"] = "My message text";
// URL to post to
var postUrl = "conversations/" + chatId + "/attachments";
this.postMultipart(postUrl, postData, filePaths, function(success, json) {
    if(json != null) {
        // Parse result
    }                                    
});
```