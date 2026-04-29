import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
} from 'discord.js';
import { RowDataPacket } from 'mysql2/promise';

interface PlayerRow extends RowDataPacket {
  id: number;
  display_name: string;
  discord_id: string | null;
  home: string | null;
  server: string | null;
  region: string | null;
  currency: number;
}

interface ServerRow extends RowDataPacket {
  linked_role_id: string;
}

interface BotClient extends Client {
  functions: {
    is_empty: (s: string) => boolean;
    check_link: (client: BotClient, discord_id: string) => Promise<boolean>;
    [key: string]: any;
  };
  database_connection: {
    query: (sql: string, values?: any[]) => Promise<[RowDataPacket[], any]>;
    execute: (sql: string, values?: any[]) => Promise<[RowDataPacket[], any]>;
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your in-game player')
    .addStringOption((option) =>
      option
        .setName('gamertag')
        .setDescription('Your in-game name')
        .setRequired(true)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    client: BotClient
  ): Promise<void> {
    const gamertag = interaction.options.getString('gamertag');

    if (!gamertag || client.functions.is_empty(gamertag)) {
      await interaction.reply({
        content: 'Please provide a valid gamertag!',
        ephemeral: true,
      });
      return;
    }

    const existingLink: boolean = await client.functions.check_link(
      client,
      interaction.user.id
    );

    if (existingLink) {
      await interaction.reply({
        content:
          'Your Discord account is already linked to an in-game player!',
        ephemeral: true,
      });
      return;
    }

    try {
      const [rows] = await client.database_connection.query(
        `SELECT * FROM players WHERE display_name = ? AND (discord_id IS NULL OR discord_id = '')`,
        [gamertag]
      ) as [PlayerRow[], any];

      if (rows.length === 0) {
        await interaction.reply({
          content: `The gamertag **${gamertag}** is either already linked to another Discord account or does not exist. Make sure you have joined the server at least once (kill someone or relog)!`,
          ephemeral: true,
        });
        return;
      }

      await client.database_connection.query(
        'UPDATE players SET discord_id = ? WHERE display_name = ?',
        [interaction.user.id, gamertag]
      );

      const [serverRows] = await client.database_connection.query(
        'SELECT linked_role_id FROM servers WHERE guild_id = ?',
        [interaction.guild?.id]
      ) as [ServerRow[], any];

      const member = interaction.guild?.members.cache.get(
        interaction.user.id
      ) as GuildMember | undefined;

      if (member) {
        try {
          await member.setNickname(gamertag);
        } catch (error) {
          console.error('[LINK] Failed to set nickname:', error);
        }

        if (serverRows.length > 0 && serverRows[0].linked_role_id) {
          try {
            await member.roles.add(serverRows[0].linked_role_id);
          } catch (error) {
            console.error('[LINK] Failed to add linked role:', error);
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor((process.env.EMBED_COLOR as `#${string}`) || '#00AAFF')
        .setTitle('Account Linked')
        .setThumbnail(process.env.EMBED_LOGO || null)
        .setTimestamp()
        .setFooter({
          text: process.env.EMBED_FOOTER_TEXT || 'Rust Console',
          iconURL: process.env.EMBED_LOGO || undefined,
        })
        .setDescription(
          `Successfully linked your Discord account to **${gamertag}**!`
        );

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[LINK COMMAND]', error);
      await interaction.reply({
        content:
          'An error occurred while linking your account. Please try again later.',
        ephemeral: true,
      });
    }
  },
};
