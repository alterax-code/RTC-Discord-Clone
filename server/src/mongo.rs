//! MongoDB connection - Messages storage
//! Responsable: Ladji

use mongodb::{bson::doc, Client, Collection};
use std::env;

use crate::models::Message;

pub async fn init_mongo() -> Collection<Message> {
    let uri = env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = env::var("MONGODB_DATABASE").unwrap_or_else(|_| "rtc".to_string());

    let client = Client::with_uri_str(&uri)
        .await
        .expect(" MongoDB connection failed");

    let db = client.database(&db_name);
    let collection = db.collection::<Message>("messages");

    println!("Connected to MongoDB ({db_name})!");
    collection
}

/// CREATE message
pub async fn create_message(
    collection: &Collection<Message>,
    channel_id: String,
    user_id: String,
    username: String,
    content: String,
) -> Option<Message> {
    let msg = Message {
    id: Some(mongodb::bson::oid::ObjectId::new()),
    channel_id,
    user_id,
    username,
    content,
    created_at: mongodb::bson::DateTime::now(),
    deleted: false,
    edited_at: None,
};
    

    match collection.insert_one(&msg, None).await {
        Ok(_) => Some(msg),
        Err(e) => {
            eprintln!(" MongoDB insert error: {e}");
            None
        }
    }
}

/// READ - historique des messages d'un channel
pub async fn get_messages_by_channel(
    collection: &Collection<Message>,
    channel_id: &str,
) -> Vec<Message> {
    use futures::TryStreamExt;

    let filter = doc! { "channel_id": channel_id, "deleted": false };

    match collection.find(filter, None).await {
        Ok(cursor) => cursor.try_collect().await.unwrap_or_default(),
        Err(e) => {
            eprintln!(" MongoDB find error: {e}");
            Vec::new()
        }
    }
}

/// SOFT DELETE un message
pub async fn delete_message(collection: &Collection<Message>, message_id: &str) -> bool {
    let object_id = match mongodb::bson::oid::ObjectId::parse_str(message_id) {
        Ok(id) => id,
        Err(_) => return false,
    };

    match collection
        .update_one(
            doc! { "_id": object_id },
            doc! { "$set": { "deleted": true } },
            None,
        )
        .await
    {
        Ok(result) => result.modified_count > 0,
        Err(e) => {
            eprintln!(" MongoDB delete error: {e}");
            false
        }
    }
}


/// READ avec pagination : limit + before (timestamp ms)
pub async fn get_messages_paginated(
    collection: &Collection<Message>,
    channel_id: &str,
    limit: i64,
    before_ms: Option<i64>,
) -> Vec<Message> {
    use futures::TryStreamExt;
    use mongodb::options::FindOptions;

    let mut filter = doc! { "channel_id": channel_id, "deleted": false };
    if let Some(ms) = before_ms {
        let dt = mongodb::bson::DateTime::from_millis(ms);
        filter.insert("created_at", doc! { "$lt": dt });
    }

    let options = FindOptions::builder()
        .sort(doc! { "created_at": -1_i32 })
        .limit(limit)
        .build();

    match collection.find(filter, options).await {
        Ok(cursor) => {
            let mut msgs: Vec<Message> = cursor.try_collect().await.unwrap_or_default();
            msgs.reverse(); // ordre chronologique
            msgs
        }
        Err(e) => {
            eprintln!(" MongoDB paginated find error: {e}");
            Vec::new()
        }
    }
}

/// Récupère un message par ID (pour vérifier le propriétaire)
pub async fn get_message_by_id(
    collection: &Collection<Message>,
    message_id: &str,
) -> Option<Message> {
    let object_id = mongodb::bson::oid::ObjectId::parse_str(message_id).ok()?;
    collection
        .find_one(doc! { "_id": object_id, "deleted": false }, None)
        .await
        .ok()?
}
/// EDIT un message - modifie le contenu et ajoute edited_at
pub async fn edit_message(
    collection: &Collection<Message>,
    message_id: &str,
    new_content: &str,
) -> Option<Message> {
    let object_id = mongodb::bson::oid::ObjectId::parse_str(message_id).ok()?;
    let now = mongodb::bson::DateTime::now();

    collection
        .find_one_and_update(
            doc! { "_id": object_id, "deleted": false },
            doc! { "$set": { "content": new_content, "edited_at": now } },
            mongodb::options::FindOneAndUpdateOptions::builder()
                .return_document(mongodb::options::ReturnDocument::After)
                .build(),
        )
        .await
        .ok()?
}

/// Ajouter une réaction à un message
pub async fn add_reaction(
    collection: &Collection<Message>,
    message_id: &str,
    emoji: &str,
    user_id: &str,
) -> bool {
    let object_id = match mongodb::bson::oid::ObjectId::parse_str(message_id) {
        Ok(id) => id,
        Err(_) => return false,
    };

    match collection
        .update_one(
            doc! { "_id": object_id, "reactions.emoji": emoji },
            doc! { "$addToSet": { "reactions.$.user_ids": user_id } },
            None,
        )
        .await
    {
        Ok(result) if result.modified_count > 0 => true,
        _ => {
            // La réaction n'existe pas encore, on la crée
            match collection
                .update_one(
                    doc! { "_id": object_id },
                    doc! { "$push": { "reactions": { "emoji": emoji, "user_ids": [user_id] } } },
                    None,
                )
                .await
            {
                Ok(result) => result.modified_count > 0,
                Err(_) => false,
            }
        }
    }
}

/// Retirer une réaction d'un message
pub async fn remove_reaction(
    collection: &Collection<Message>,
    message_id: &str,
    emoji: &str,
    user_id: &str,
) -> bool {
    let object_id = match mongodb::bson::oid::ObjectId::parse_str(message_id) {
        Ok(id) => id,
        Err(_) => return false,
    };

    match collection
        .update_one(
            doc! { "_id": object_id, "reactions.emoji": emoji },
            doc! { "$pull": { "reactions.$.user_ids": user_id } },
            None,
        )
        .await
    {
        Ok(result) => result.modified_count > 0,
        Err(e) => {
            eprintln!("MongoDB remove_reaction error: {e}");
            false
        }
    }
}
