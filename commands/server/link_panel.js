const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkpanel')
    .setDescription('Send the embed for linking')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    await check_permissions_and_send_embed(interaction);
  },
};

async function check_permissions_and_send_embed(interaction) {
  const requiredPermissions =
    PermissionFlagsBits.KickMembers |
    PermissionFlagsBits.BanMembers |
    PermissionFlagsBits.ManageGuild |
    PermissionFlagsBits.ManageMessages;

  if (!interaction.member.permissions.has(requiredPermissions)) {
    return await interaction.reply({
      content: 'You do not have permission to use this command!',
      ephemeral: true,
    });
  }

  const server = interaction.client.functions.get_server_discord(
    interaction.client,
    interaction.guild.id
  );

  if (!server) {
    return await interaction.reply({
      content: '⚠️ This server is not registered in the database.',
      ephemeral: true,
    });
  }

  let channel = interaction.client.channels.cache.get(server.link_channel_id);

  // If the channel is missing or deleted, recreate it
  if (!channel) {
    try {
      const category = interaction.guild.channels.cache.get(server.category_id);
      channel = await interaction.guild.channels.create({
        name: 'Account Linking',
        type: ChannelType.GuildText,
        parent: category ? category.id : null,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
        ],
      });

      // Update database with the new link_channel_id
      await interaction.client.database_connection.execute(
        `UPDATE servers SET link_channel_id = ? WHERE guild_id = ?`,
        [channel.id, interaction.guild.id]
      );
    } catch (err) {
      console.error('[LINK PANEL] Failed to create or update link channel:', err);
      return await interaction.reply({
        content: '❌ Failed to create or update the account linking channel.',
        ephemeral: true,
      });
    }
  }

  // Build the embed and button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('link_account')
      .setLabel('Link Account')
      .setStyle('Success')
  );

  const embed = new EmbedBuilder()
    .setColor(process.env.EMBED_COLOR || '#00AAFF')
    .setTitle('Account Linking')
    .setThumbnail(process.env.EMBED_LOGO || null)
    .setTimestamp()
    .setFooter({
      text: process.env.EMBED_FOOTER_TEXT || 'Rust Console',
      iconURL: process.env.EMBED_LOGO || null,
    })
    .setDescription('Select the button below to link your account');

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  await interaction.reply({ content: '✅ Link panel sent.', ephemeral: true });
}
