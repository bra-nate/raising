import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createMember, createUser } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: 'pastor' | 'leader' }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

describe('member data integrity', () => {
  it('persists cleared optional fields and group as null', async () => {
    const leader = await createUser({ role: 'leader' });
    const group = await prisma.group.create({ data: { name: 'Group', leaderId: leader.id } });
    const member = await createMember(leader.id);
    await prisma.member.update({
      where: { id: member.id },
      data: { phone: '+233 20 123 4567', email: 'member@example.com', address: 'Accra', groupId: group.id },
    });

    await request(app)
      .patch(`/api/v1/members/${member.id}`)
      .set('Authorization', auth(leader))
      .send({ phone: '', email: '', address: '', groupId: '' })
      .expect(200);

    const updated = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(updated).toMatchObject({ phone: null, email: null, address: null, groupId: null });
  });

  it('rejects assigning a new member to an inactive leader', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader', isActive: false });

    await request(app)
      .post('/api/v1/members')
      .set('Authorization', auth(pastor))
      .send({ firstName: 'New', lastName: 'Member', assignedLeaderId: leader.id })
      .expect(400);
  });

  it('rejects a group owned by a different leader on create and update', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const otherLeader = await createUser({ role: 'leader' });
    const otherGroup = await prisma.group.create({ data: { name: 'Other group', leaderId: otherLeader.id } });

    await request(app)
      .post('/api/v1/members')
      .set('Authorization', auth(pastor))
      .send({ firstName: 'New', lastName: 'Member', assignedLeaderId: leader.id, groupId: otherGroup.id })
      .expect(400);

    const member = await createMember(leader.id);
    await request(app)
      .patch(`/api/v1/members/${member.id}`)
      .set('Authorization', auth(leader))
      .send({ groupId: otherGroup.id })
      .expect(400);
  });
});
