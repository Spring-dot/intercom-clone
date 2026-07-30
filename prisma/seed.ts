import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient();

// TODO: replace with your real Clerk user ID after your first sign-up
// (find it in the Clerk dashboard, or by logging `user.id` from `currentUser()`).
const CLERK_USER_ID = "REPLACE_WITH_YOUR_CLERK_USER_ID";
const CLERK_USER_EMAIL = "REPLACE_WITH_YOUR_CLERK_EMAIL";

async function main() {
  await db.user.upsert({
    where: { id: CLERK_USER_ID },
    update: {},
    create: {
      id: CLERK_USER_ID,
      email: CLERK_USER_EMAIL,
      name: "Demo Admin",
    },
  });

  const workspace = await db.workspace.create({
    data: { name: "Demo Workspace" },
  });

  await db.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: CLERK_USER_ID,
      role: "admin",
    },
  });

  const [alice, bob] = await Promise.all([
    db.contact.create({
      data: {
        workspaceId: workspace.id,
        name: "Alice Johnson",
        email: "alice@example.com",
      },
    }),
    db.contact.create({
      data: {
        workspaceId: workspace.id,
        name: "Bob Martinez",
        email: "bob@example.com",
      },
    }),
  ]);

  const chatConversation = await db.conversation.create({
    data: {
      workspaceId: workspace.id,
      contactId: alice.id,
      channel: "chat",
      status: "open",
    },
  });

  const chatMessages: { senderType: "contact" | "agent"; body: string }[] = [
    { senderType: "contact", body: "Hi, I can't find the export button." },
    { senderType: "agent", body: "Hey Alice! It's under Settings > Data." },
    { senderType: "contact", body: "Found it, thank you!" },
    { senderType: "agent", body: "Glad to hear it. Anything else?" },
    { senderType: "contact", body: "Nope, that's all for now." },
  ];
  for (const message of chatMessages) {
    await db.message.create({
      data: {
        workspaceId: workspace.id,
        conversationId: chatConversation.id,
        senderType: message.senderType,
        authorId: message.senderType === "agent" ? CLERK_USER_ID : null,
        body: message.body,
      },
    });
  }

  const emailConversation = await db.conversation.create({
    data: {
      workspaceId: workspace.id,
      contactId: bob.id,
      channel: "email",
      status: "resolved",
    },
  });

  const emailMessages: { senderType: "contact" | "agent"; body: string }[] = [
    { senderType: "contact", body: "My invoice from last month looks wrong." },
    { senderType: "agent", body: "Thanks for flagging it -- I've issued a corrected invoice by email." },
  ];
  for (const message of emailMessages) {
    await db.message.create({
      data: {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        senderType: message.senderType,
        authorId: message.senderType === "agent" ? CLERK_USER_ID : null,
        body: message.body,
      },
    });
  }

  const category = await db.category.create({
    data: {
      workspaceId: workspace.id,
      name: "Getting Started",
      slug: "getting-started",
    },
  });

  await db.article.create({
    data: {
      workspaceId: workspace.id,
      categoryId: category.id,
      title: "How to export your data",
      slug: "how-to-export-your-data",
      content: "Go to Settings > Data > Export to download a CSV of your data.",
      status: "published",
    },
  });

  console.log(`Seeded workspace ${workspace.id} for user ${CLERK_USER_ID}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
