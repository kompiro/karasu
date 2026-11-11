# Trying karasu with your team: a trial session script

> **English** (this file) · [日本語](team-trial-session.ja.md)

A script for trying karasu with a development team in 60 minutes. What it checks is whether **looking at the same model surfaces places where the
team understands the system differently, and changes how the team talks about it**. This is not a karasu demo: don't teach how to use it, and
write down what did not work as it happened.

## People

- **Facilitator** (1): keeps time and asks the questions. Answers questions about the tool only when a participant is stuck and cannot go on.
- **Note-taker** (1): writes down what they notice, by role ("lead", "joined three months ago") rather than by name.
- **Participants** (3 to 6): people who work on the same system. A mix of people who know it well and people who joined recently makes
  differences easier to find.

## Before the session

1. **Pick one topic.** Choose a design question the team will decide soon (for example: should we split this service, which team owns this
   database).
2. **Prepare a model of your own system.** Only the part the topic touches is enough. Use
   [Reverse-engineering with an AI agent](reverse-engineering-with-ai.md) or [Designing service and team boundaries](01-service-team-design.md)
   as a starting point. If you cannot prepare one, skip step 3; in part 2, after everyone writes their prediction, put the answers side by
   side on a whiteboard instead of the model and talk from there.
3. **Make a share link.** Open the model, press **Share**, and copy the **private link**.
   - The link carries the model itself (styles included); karasu does not store the model anywhere. In a private link the model sits after the
     `#` in the URL, which the browser does not send to the server, so it does not reach karasu's server either.
   - Anyone who has the link can see the model. If the model is confidential, post the link only in your team's own chat.

## The session (60 minutes)

| About | Part |
| --- | --- |
| 15 min | 1. Introduction and first run |
| 25 min | 2. On your own system |
| 10 min | 3. Retrospective |
| 10 min | Buffer |

If you run late, shorten "Talk" in part 2.

### 1. Introduction and first run (15 minutes)

> What we want to find out today is not how good the tool is, but whether looking at the same diagram changes how the team talks. There is no
> right answer. Where you get stuck is what we most want to know, so say it out loud.
>
> Open karasu.kompiro.dev in a private Chrome or Edge window, choose "Design a service split", and follow the panel to the end on your own.

A private window is used because Welcome shows only on the first visit. If Welcome does not appear, open it with **Show Welcome…**
from the command palette (`Ctrl/Cmd+Shift+P`). The facilitator and the note-taker stay quiet and note where people
stopped and what they said out loud.

### 2. On your own system (25 minutes)

1. **Predict.** Before showing the model, ask one or two questions about the topic and have everyone write their answer down (for example:
   if this service goes down, what else is affected?).
2. **Look at the model.** The facilitator shares their screen, opens the model, and puts it next to everyone's answers. Note any differences.
   Do not decide who is right.
3. **Talk.** Post the private link in the chat so everyone opens it on their own device, and have the team discuss the topic you picked. The
   facilitator does not step in; the note-taker writes down which part of the diagram people pointed at and anything said that shows an
   understanding changed.

### 3. Retrospective (10 minutes)

The note-taker reads out the differences found, then everyone answers in turn:

> Name one thing you learned today about your system or your team.

Finally, decide whether to keep using the model. If you will, suggest keeping its files in the team's repository: a share link is for viewing,
and edits made by someone who opened it do not flow back to the original model.

## After the session

**Send a short survey the same day.**

1. Where did you get stuck?
2. Did you notice a relationship in the system that you had not noticed before?
3. Would you want to use it with your team? If so, in what situation?
4. If you kept using it, what would most likely stop you?

**Ask again two weeks later.**

1. Have you opened the model since? Did you change it? How many minutes did the change take?
2. If you did not use it, why not?

Thoughts and complaints are also welcome on [GitHub Discussions](https://github.com/kompiro/karasu/discussions).
