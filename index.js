const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  PermissionFlagsBits 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Configurações em memória (ou podes ajustar conforme preferires)
let cargoAprovadoId = null; 
let canalAdminId = null;

client.once('ready', async () => {
  console.log(`Bot online como ${client.user.tag}!`);

  const commands = [
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Envia o painel interativo de recrutamento para o canal atual.'),
    
    new SlashCommandBuilder()
      .setName('configurar')
      .setDescription('Configura os cargos e canais do bot.')
      .addRoleOption(option => 
        option.setName('cargo_aprovado')
              .setDescription('Cargo atribuído ao aprovar um membro')
              .setRequired(true))
      .addChannelOption(option => 
        option.setName('canal_admin')
              .setDescription('Canal onde chegam as fichas para aprovação')
              .setRequired(true))
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('A registar comandos de barra (slash commands)...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Comandos registados com sucesso!');
  } catch (error) {
    console.error(error);
  }
});

// Evento para interações (Comandos, Menus e Botões)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu() && !interaction.isButton()) return;

  // Comando /configurar
  if (interaction.isChatInputCommand() && interaction.commandName === 'configurar') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Apenas administradores podem usar este comando.', ephemeral: true });
    }

    cargoAprovadoId = interaction.options.getRole('cargo_aprovado').id;
    canalAdminId = interaction.options.getChannel('canal_admin').id;

    return interaction.reply({ 
      content: `Configuração guardada com sucesso!\n🔹 **Cargo de Aprovado:** <@&${cargoAprovadoId}>\n🔹 **Canal de Administração:** <#${canalAdminId}>`, 
      ephemeral: true 
    });
  }

  // Comando /painel
  if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Apenas administradores podem usar este comando.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Recrutamento - Império Zero')
      .setDescription('Seja bem-vindo ao painel de recrutamento oficial!\n\nPara iniciar o seu processo de recrutamento e candidatar-se à nossa guilda, selecione a sua função principal no menu abaixo.')
      .setColor(0x2b2d31)
      .setFooter({ text: 'Sistema de Recrutamento Automático' });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('selecionar_funcao')
        .setPlaceholder('🎯 Escolha a sua função principal...')
        .addOptions([
          { label: 'Rush', description: 'Candidatar-se para a função de Rush', value: 'funcao_rush', emoji: '⚡' },
          { label: 'Cura 1', description: 'Candidatar-se para a função de Suporte / Cura 1', value: 'funcao_cura1', emoji: '🩹' },
          { label: 'Cura 2', description: 'Candidatar-se para a função de Suporte / Cura 2', value: 'funcao_cura2', emoji: '🩺' },
          { label: 'Full Gás', description: 'Candidatar-se para a função de Full Gás', value: 'funcao_fullgas', emoji: '🔥' }
        ])
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Painel enviado com sucesso!', ephemeral: true });
  }

  // Quando o utilizador escolhe uma função no menu
  if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_funcao') {
    const funcaoEscolhida = interaction.values[0];
    const guild = interaction.guild;
    const user = interaction.user;

    // Criar canal privado para o recrutamento
    try {
      const channelName = `recrutamento-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
      const privateChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      const embedPrivado = new EmbedBuilder()
        .setTitle('📝 Ficha de Recrutamento Criada')
        .setDescription(`Olá ${user}, a sua ficha para a função **${funcaoEscolhida.replace('funcao_', '').toUpperCase()}** foi iniciada com sucesso!\n\nA nossa equipa de recrutadores irá analisá-la em breve neste canal privado.`)
        .setColor(0x00ffcc);

      const rowAdmin = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aprovar_${user.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reprovar_${user.id}`).setLabel('Reprovar').setStyle(ButtonStyle.Danger)
      );

      await privateChannel.send({ content: `${user}`, embeds: [embedPrivado] });

      // Enviar aviso para o canal administrativo (se configurado)
      if (canalAdminId) {
        const canalAdmin = guild.channels.cache.get(canalAdminId);
        if (canalAdmin) {
          await canalAdmin.send({
            content: `New recruitment submission from ${user} for **${funcaoEscolhida}**. Canal privado: <#${privateChannel.id}>`,
            components: [rowAdmin]
          });
        }
      }

      return interaction.reply({ content: `O seu canal privado foi criado com sucesso: <#${privateChannel.id}>`, ephemeral: true });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: 'Ocorreu um erro ao criar o seu canal privado.', ephemeral: true });
    }
  }

  // Botões de Aprovar / Reprovar (Gestão administrativa)
  if (interaction.isButton()) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Não tens permissão para usar este botão.', ephemeral: true });
    }

    const [acao, targetUserId] = interaction.customId.split('_');
    const guild = interaction.guild;

    try {
      const member = await guild.members.fetch(targetUserId);

      if (acao === 'aprovar') {
        if (cargoAprovadoId) {
          await member.roles.add(cargoAprovadoId);
        }
        await interaction.update({ content: `✅ Candidato <@${targetUserId}> **APROVADO** por ${interaction.user}.`, components: [] });
        try {
          await member.send('Parabéns! A sua candidatura foi aprovada no Império Zero.');
        } catch (e) {}
      } else if (acao === 'reprovar') {
        await interaction.update({ content: `❌ Candidato <@${targetUserId}> **REPROVADO** por ${interaction.user}.`, components: [] });
        try {
          await member.send('Infelizmente a sua candidatura não foi aceite desta vez.');
        } catch (e) {}
      }
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: 'Erro ao processar a ação sobre o membro.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
      
