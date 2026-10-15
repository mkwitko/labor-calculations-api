import { hash, verify } from 'argon2'
import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

describe('portal first-access invite', () => {
  // O teto por rota (5 em 15 minutos) vale também em teste e conta por IP.
  // Todo request do arquivo sai do mesmo endereço, então sem um IP por teste os
  // últimos casos colheriam 429 no lugar do status que aferem.
  let testIndex = 0

  beforeEach(async () => {
    testIndex += 1
    await cleanDatabase()
    await app.ready()
  })

  const remoteAddress = () =>
    `10.0.${Math.floor(testIndex / 256)}.${testIndex % 256}`

  const acceptInvite = (token: string, password: string) =>
    app.inject({
      method: 'POST',
      url: '/client-portal/invites/accept',
      remoteAddress: remoteAddress(),
      payload: { token, password },
    })

  const linkInvite = (token: string, password: string) =>
    app.inject({
      method: 'POST',
      url: '/client-portal/invites/link',
      remoteAddress: remoteAddress(),
      payload: { token, password },
    })

  function authToken(userId: string) {
    return app.jwt.sign({ sub: userId })
  }

  function tokenFromUrl(inviteUrl: string) {
    return inviteUrl.split('/').pop() as string
  }

  async function createClientViaApi(mail?: string) {
    const { user, organization } = await createTestUser()

    const response = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { name: 'Cliente Portal', document: '12345678901', mail },
    })

    return { user, organization, response }
  }

  // A senha inicial eram os últimos cinco dígitos do CPF — adivinhável por
  // qualquer um com acesso à petição inicial.
  it('creates the client without any password', async () => {
    const { response } = await createClientViaApi('cliente@example.com')

    expect(response.statusCode).toBe(201)

    const client = await systemPrisma.client.findUniqueOrThrow({
      where: { id: response.json().id },
      select: { password: true },
    })

    expect(client.password).toBeNull()
  })

  it('returns an invite link when the client has an e-mail', async () => {
    const { response } = await createClientViaApi('cliente@example.com')

    expect(response.json().inviteUrl).toContain('/portal/convite/')
  })

  it('returns no link when the client has no e-mail', async () => {
    const { response } = await createClientViaApi()

    expect(response.json().inviteUrl).toBeNull()
  })

  it('issues a link on demand for a client created without e-mail', async () => {
    const { user, response } = await createClientViaApi()

    const invite = await app.inject({
      method: 'POST',
      url: `/clients/${response.json().id}/portal-invite`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(invite.statusCode).toBe(201)
    expect(invite.json().inviteUrl).toContain('/portal/convite/')
    expect(invite.json().emailSent).toBe(false)
  })

  it('404s a client from another organization', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const { user: outsider } = await createTestUser()

    const invite = await app.inject({
      method: 'POST',
      url: `/clients/${response.json().id}/portal-invite`,
      headers: { authorization: `Bearer ${authToken(outsider.id)}` },
    })

    expect(invite.statusCode).toBe(404)
  })

  it('describes the invite to the client before they set a password', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    const preview = await app.inject({
      method: 'GET',
      url: `/client-portal/invites/${token}`,
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.json().clientName).toBe('Cliente Portal')
    expect(preview.json().officeName).toEqual(expect.any(String))
  })

  it('avisa quando o e-mail já tem conta com senha em outro escritório', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const other = await createTestUser()

    await systemPrisma.client.create({
      data: {
        organizationId: other.organization.id,
        userId: other.user.id,
        name: 'Cliente Portal',
        mail: 'cliente@example.com',
        password: 'hash-irrelevante',
      },
    })

    const preview = await app.inject({
      method: 'GET',
      url: `/client-portal/invites/${tokenFromUrl(response.json().inviteUrl)}`,
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.json()).toMatchObject({ hasOtherAccounts: true })
  })

  it('não avisa quando o e-mail só existe neste escritório', async () => {
    const { response } = await createClientViaApi('cliente@example.com')

    const preview = await app.inject({
      method: 'GET',
      url: `/client-portal/invites/${tokenFromUrl(response.json().inviteUrl)}`,
    })

    expect(preview.json()).toMatchObject({ hasOtherAccounts: false })
  })

  it('sets the password from the invite and lets the client sign in', async () => {
    const { user, response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    const accepted = await acceptInvite(token, 'MinhaSenha123')

    expect(accepted.statusCode).toBe(200)

    const client = await systemPrisma.client.findUniqueOrThrow({
      where: { id: response.json().id },
      select: { password: true, mustChangePassword: true },
    })

    expect(client.mustChangePassword).toBe(false)
    expect(await verify(client.password ?? '', 'MinhaSenha123')).toBe(true)

    const signIn = await app.inject({
      method: 'POST',
      url: '/client-portal/sessions',
      payload: {
        oabNumber: user.oabNumber,
        mail: 'cliente@example.com',
        password: 'MinhaSenha123',
      },
    })

    expect(signIn.statusCode).toBe(201)
  })

  it('refuses to reuse an invite', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    expect((await acceptInvite(token, 'MinhaSenha123')).statusCode).toBe(200)
    expect((await acceptInvite(token, 'other-pass-1')).statusCode).toBe(400)
  })

  it('refuses a password equal to the CPF', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    const accepted = await acceptInvite(token, '12345678901')

    expect(accepted.statusCode).toBe(400)
  })

  // Convite reemitido para quem já acessa o portal: pedir senha nova aqui
  // sobrescrevia a senha em uso sem a pessoa provar quem é.
  it('marca o cadastro que já tem senha como ativo', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    await systemPrisma.client.update({
      where: { id: response.json().id },
      data: { password: await hash('old-pass-1') },
    })

    const preview = await app.inject({
      method: 'GET',
      url: `/client-portal/invites/${token}`,
    })

    expect(preview.json()).toMatchObject({ alreadyActive: true })
  })

  it('recusa aceite de cadastro que já tem senha, sem trocá-la', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    await systemPrisma.client.update({
      where: { id: response.json().id },
      data: { password: await hash('old-pass-1') },
    })

    const accepted = await acceptInvite(token, 'SenhaNova123')

    expect(accepted.statusCode).toBe(400)

    const client = await systemPrisma.client.findUniqueOrThrow({
      where: { id: response.json().id },
      select: { password: true },
    })

    expect(await verify(client.password ?? '', 'old-pass-1')).toBe(true)
  })

  // Erro de validação não pode queimar o link: quem errou a senha uma vez
  // continua com o mesmo convite.
  it('mantém o link válido depois da recusa por CPF', async () => {
    const { response } = await createClientViaApi('cliente@example.com')
    const token = tokenFromUrl(response.json().inviteUrl)

    expect((await acceptInvite(token, '12345678901')).statusCode).toBe(400)
    expect((await acceptInvite(token, 'MinhaSenha123')).statusCode).toBe(200)
  })

  describe('vínculo com a conta que já existe', () => {
    async function inviteWithSibling(password: string) {
      const { user, organization, response } = await createClientViaApi(
        'cliente@example.com',
      )
      const other = await createTestUser()

      const sibling = await systemPrisma.client.create({
        data: {
          organizationId: other.organization.id,
          userId: other.user.id,
          name: 'Cliente Portal',
          mail: 'cliente@example.com',
          password: await hash(password),
        },
        select: { id: true },
      })

      return {
        user,
        organization,
        sibling,
        clientId: response.json().id as string,
        token: tokenFromUrl(response.json().inviteUrl),
      }
    }

    it('ativa o cadastro com a senha que a pessoa já usa', async () => {
      const { token, clientId } = await inviteWithSibling('old-pass-1')

      const linked = await linkInvite(token, 'old-pass-1')

      expect(linked.statusCode).toBe(200)

      const client = await systemPrisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { password: true, mustChangePassword: true },
      })

      expect(client.mustChangePassword).toBe(false)
      expect(await verify(client.password ?? '', 'old-pass-1')).toBe(true)
    })

    // O ponto do vínculo: um login só passa a servir aos dois escritórios, e é
    // o `linked` do cookie que permite trocar sem digitar senha de novo.
    it('faz o login enxergar os dois cadastros', async () => {
      const { token, organization } = await inviteWithSibling('old-pass-1')

      await linkInvite(token, 'old-pass-1')

      const signIn = await app.inject({
        method: 'POST',
        url: '/client-portal/sessions',
        payload: { mail: 'cliente@example.com', password: 'old-pass-1' },
      })

      expect(signIn.statusCode).toBe(201)
      expect(signIn.json().status).toBe('choose_organization')
      expect(signIn.json().organizations).toHaveLength(2)
      expect(signIn.json().organizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: organization.id }),
        ]),
      )
    })

    it('recusa senha que não bate e deixa o cadastro sem senha', async () => {
      const { token, clientId } = await inviteWithSibling('old-pass-1')

      const linked = await linkInvite(token, 'ChutePqp123')

      expect(linked.statusCode).toBe(400)

      const client = await systemPrisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { password: true },
      })

      expect(client.password).toBeNull()
    })

    it('mantém o link válido depois da senha errada', async () => {
      const { token } = await inviteWithSibling('old-pass-1')

      expect((await linkInvite(token, 'ChutePqp123')).statusCode).toBe(400)
      expect((await linkInvite(token, 'old-pass-1')).statusCode).toBe(200)
    })

    it('recusa vínculo quando não existe conta com o e-mail', async () => {
      const { response } = await createClientViaApi('cliente@example.com')

      const linked = await linkInvite(
        tokenFromUrl(response.json().inviteUrl),
        'QualquerSenha123',
      )

      expect(linked.statusCode).toBe(400)
    })
  })

  it('refuses an unknown token', async () => {
    const preview = await app.inject({
      method: 'GET',
      url: '/client-portal/invites/nao-existe',
    })

    expect(preview.statusCode).toBe(400)
  })
})
