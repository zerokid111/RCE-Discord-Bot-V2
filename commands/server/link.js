const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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

  async execute(interaction, client) {
    const gamertag = interaction.options.getString('gamertag');

    if (client.functions.is_empty(gamertag)) {
      return await interaction.reply({
        content: 'Please provide a valid gamertag!',
        ephemeral: true,
      });
    }

    // Check if the user already has a linked account
    const existingLink = await client.functions.check_link(
      client,
      interaction.user.id
    );

    if (existingLink) {
      return await interaction.reply({
        content: 'Your Discord account is already linked to an in-game player!',
        ephemeral: true,
      });
    }

    try {
      // Check if the gamertag exists in the database and is not already linked
      const [rows] = await client.database_connection.query(
        `SELECT * FROM players WHERE display_name = ? AND (discord_id IS NULL OR discord_id = '')`,
        [gamertag]
      );

      if (rows.length === 0) {
        return await interaction.reply({
          content: `The gamertag **${gamertag}** is either already linked to another Discord account or does not exist. Make sure you have joined the server at least once (kill someone or relog)!`,
          ephemeral: true,
        });
      }

      // Update the player's discord ID in the database
      await client.database_connection.query(
        'UPDATE players SET discord_id = ? WHERE display_name = ?',
        [interaction.user.id, gamertag]
      );

      // Fetch linked_role_id from the database
      const [serverRows] = await client.database_connection.query(
        'SELECT linked_role_id FROM servers WHERE guild_id = ?',
        [interaction.guild.id]
      );

      // Set nickname and add linked role if available
      const member = interaction.guild.members.cache.get(interaction.user.id);
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
        .setColor(process.env.EMBED_COLOR || '#00AAFF')
        .setTitle('Account Linked')
        .setThumbnail(process.env.EMBED_LOGO || null)
        .setTimestamp()
        .setFooter({
          text: process.env.EMBED_FOOTER_TEXT || 'Rust Console',
          iconURL: process.env.EMBED_LOGO || null,
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
        content: `An error occurred while linking your account. Please try again later.`,
        ephemeral: true,
      });
    }
  },
};
