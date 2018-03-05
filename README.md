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
messengerApi.configure("https", "api.alterdesk.com", "v1", 443, <ALTERDESK_API_TOKEN>);
```

### Send a message
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
messageData.overrideToken = <OPTIONAL_ALTERNATIVE_API_TOKEN>;

// Send the message and parse result in callback
messengerApi.sendMessage(messageData, function(success, json) {
    console.log("Send message successful: " + success);
    if(json != null) {
        var messageId = json["id"];
    }
});
```

### Invite a user
To invite a user, first create an InviteUserData object and set the required fields
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
// Invite users in the group
groupData.addInvite(inviteData);
```

### Create a group chat
```javascript
// Create a group data instance
var groupData = new Messenger.CreateGroupData();

// Set the chat subject
groupData.subject = "My chat name"
// Set an auxiliary id for this chat
groupData.auxId = <MY_AUX_ID>
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
groupData.overrideToken = <OPTIONAL_ALTERNATIVE_API_TOKEN>;

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
```

### Download chat in pdf format
```javascript
```

### Other API calls
Get
```javascript
```
Post
```javascript
```
Post Multipart
```javascript
```