import type { DatabaseSync } from 'node:sqlite';

const DOCTORS = ['doctor-demo-001', 'doctor-demo-002', 'doctor-demo-003'] as const;
const GROUPS = [
  [
    'GROUP-GERIATRICS',
    '老年医学与连续照护',
    '老年医学',
    '讨论多病共存、综合评估与连续照护工作方法。',
  ],
  ['GROUP-CARDIOLOGY', '心血管临床交流', '心血管内科', '交流随访管理、检查解读与常见临床问题。'],
  ['GROUP-ENDOCRINE', '内分泌与代谢', '内分泌科', '围绕糖代谢、生活方式支持和长期随访展开讨论。'],
  ['GROUP-GENERAL', '全科与基层实践', '全科医学', '分享全科门诊、转诊衔接和基层工作经验。'],
  ['GROUP-RESPIRATORY', '呼吸健康管理', '呼吸内科', '讨论慢病随访、健康教育与协作照护。'],
  ['GROUP-REHAB', '康复医学同行圈', '康复医学', '交流功能评估、康复计划与患者沟通经验。'],
] as const;

export function seedSocialDemo(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const group = db.prepare(
      'INSERT OR IGNORE INTO social_groups(id,name,specialty,description) VALUES(?,?,?,?)',
    );
    for (const item of GROUPS) group.run(...item);
    const membership = db.prepare(
      'INSERT OR IGNORE INTO social_memberships(group_id,identity_id,joined_at) VALUES(?,?,?)',
    );
    for (const item of GROUPS.slice(0, 5))
      membership.run(item[0], DOCTORS[0], '2026-08-01T09:00:00+08:00');
    for (const item of GROUPS.slice(0, 4))
      membership.run(item[0], DOCTORS[1], '2026-08-02T09:00:00+08:00');
    for (const item of GROUPS.slice(2))
      membership.run(item[0], DOCTORS[2], '2026-08-03T09:00:00+08:00');
    const preference = db.prepare(
      'INSERT OR IGNORE INTO social_preferences(identity_id,enabled,notifications_enabled,updated_at) VALUES(?,?,?,?)',
    );
    for (const doctor of DOCTORS) preference.run(doctor, 1, 1, '2026-09-10T08:00:00+08:00');

    const post = db.prepare(`INSERT OR IGNORE INTO social_posts(
      id,group_id,author_id,display_mode,title,body,tags_json,contains_case_material,
      deidentification_confirmed_at,moderation_status,created_at,last_activity_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    const topicStems = [
      '门诊随访记录如何更清楚',
      '长期管理中的沟通经验',
      '跨科协作流程讨论',
      '健康教育材料怎么写',
    ];
    for (const [groupIndex, item] of GROUPS.entries()) {
      for (let postIndex = 0; postIndex < 4; postIndex += 1) {
        const sequence = groupIndex * 4 + postIndex + 1;
        const day = String(10 + (sequence % 20)).padStart(2, '0');
        const createdAt = `2026-08-${day}T${String(9 + postIndex).padStart(2, '0')}:00:00+08:00`;
        post.run(
          `POST-${String(sequence).padStart(3, '0')}`,
          item[0],
          DOCTORS[sequence % 3],
          sequence % 7 === 0 ? 'anonymous' : 'named',
          `${topicStems[postIndex]}：${item[2]}`,
          `结合日常工作整理了一份${item[2]}交流提纲，主要想听听大家在记录、沟通和后续安排方面的做法。内容为合成讨论文本，不含真实患者资料。`,
          JSON.stringify([item[2], postIndex % 2 === 0 ? '随访管理' : '同行经验']),
          0,
          null,
          'published',
          createdAt,
          `2026-09-${String(1 + (sequence % 9)).padStart(2, '0')}T15:00:00+08:00`,
        );
      }
    }
    const comment = db.prepare(`INSERT OR IGNORE INTO social_comments(
      id,post_id,parent_comment_id,author_id,display_mode,body,created_at
    ) VALUES(?,?,?,?,?,?,?)`);
    for (let postIndex = 1; postIndex <= 24; postIndex += 1) {
      const postId = `POST-${String(postIndex).padStart(3, '0')}`;
      for (let commentIndex = 1; commentIndex <= 3; commentIndex += 1) {
        comment.run(
          `COMMENT-${String(postIndex).padStart(3, '0')}-${commentIndex}`,
          postId,
          commentIndex === 3 ? `COMMENT-${String(postIndex).padStart(3, '0')}-1` : null,
          DOCTORS[(postIndex + commentIndex) % 3],
          commentIndex === 2 && postIndex % 5 === 0 ? 'anonymous' : 'named',
          commentIndex === 3
            ? '回复上面的观点：可以把流程再拆成记录、确认和复核三步。'
            : `第 ${commentIndex} 条同行回复：这个做法在日常工作中比较容易执行。`,
          `2026-09-${String(1 + (postIndex % 9)).padStart(2, '0')}T${String(10 + commentIndex).padStart(2, '0')}:00:00+08:00`,
        );
      }
    }
    const like = db.prepare(
      'INSERT OR IGNORE INTO social_likes(post_id,identity_id,created_at) VALUES(?,?,?)',
    );
    const bookmark = db.prepare(
      'INSERT OR IGNORE INTO social_bookmarks(post_id,identity_id,created_at) VALUES(?,?,?)',
    );
    for (let index = 1; index <= 24; index += 1) {
      const postId = `POST-${String(index).padStart(3, '0')}`;
      like.run(postId, DOCTORS[0], '2026-09-10T08:00:00+08:00');
      like.run(postId, DOCTORS[index % 3], '2026-09-10T08:01:00+08:00');
      if (index <= 20) bookmark.run(postId, DOCTORS[0], '2026-09-10T08:02:00+08:00');
    }
    const notification = db.prepare(
      'INSERT OR IGNORE INTO social_notifications(id,recipient_id,actor_id,post_id,comment_id,kind,created_at,read_at) VALUES(?,?,?,?,?,?,?,?)',
    );
    for (let index = 1; index <= 20; index += 1)
      notification.run(
        `NOTICE-${String(index).padStart(3, '0')}`,
        DOCTORS[0],
        DOCTORS[1 + (index % 2)],
        `POST-${String(index).padStart(3, '0')}`,
        index % 2 ? `COMMENT-${String(index).padStart(3, '0')}-1` : null,
        index % 4 === 0
          ? 'bookmark'
          : index % 3 === 0
            ? 'like'
            : index % 2 === 0
              ? 'reply'
              : 'comment',
        `2026-09-${String(1 + (index % 9)).padStart(2, '0')}T16:00:00+08:00`,
        index <= 4 ? '2026-09-10T08:00:00+08:00' : null,
      );

    const conversation = db.prepare(
      'INSERT OR IGNORE INTO social_conversations(id,created_at,updated_at) VALUES(?,?,?)',
    );
    const member = db.prepare(
      'INSERT OR IGNORE INTO social_conversation_members(conversation_id,identity_id) VALUES(?,?)',
    );
    const message = db.prepare(
      'INSERT OR IGNORE INTO social_direct_messages(id,sender_id,recipient_id,body,sent_at,conversation_id,read_at) VALUES(?,?,?,?,?,?,?)',
    );
    const pairs = [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const;
    for (const [pairIndex, [left, right]] of pairs.entries()) {
      const conversationId = `CONVERSATION-${pairIndex + 1}`;
      conversation.run(conversationId, '2026-08-20T09:00:00+08:00', '2026-09-10T11:00:00+08:00');
      member.run(conversationId, DOCTORS[left]);
      member.run(conversationId, DOCTORS[right]);
      for (let index = 1; index <= 36; index += 1) {
        const sender = index % 2 ? DOCTORS[left] : DOCTORS[right];
        const recipient = index % 2 ? DOCTORS[right] : DOCTORS[left];
        message.run(
          `DM-${pairIndex + 1}-${String(index).padStart(2, '0')}`,
          sender,
          recipient,
          `第 ${index} 条同行私信演示：围绕科室工作安排进行沟通。`,
          `2026-09-${String(1 + Math.floor((index - 1) / 3)).padStart(2, '0')}T${String(8 + (index % 10)).padStart(2, '0')}:00:00+08:00`,
          conversationId,
          recipient === DOCTORS[0] && index > 20 ? null : '2026-09-10T12:00:00+08:00',
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
