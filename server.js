const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

app.get('/api/skills', async (req, res) => {
    const session = driver.session();
    try {
        const result = await session.run(`
            MATCH (n:Skill)
            OPTIONAL MATCH (n)-[r:REQUIRES]->(m:Skill)
            RETURN n, r, m
        `);

        const elements = [];
        const addedNodes = new Set();

        result.records.forEach(record => {
            const node1 = record.get('n').properties;
            
            if (!addedNodes.has(node1.id)) {
                elements.push({ data: { id: node1.id, name: node1.name, group: node1.group } });
                addedNodes.add(node1.id);
            }

            const rel = record.get('r');
            if (rel) {
                const node2 = record.get('m').properties;
                elements.push({
                    data: { id: `${node1.id}-${node2.id}`, source: node1.id, target: node2.id }
                });
            }
        });

        res.json(elements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/skills', async (req, res) => {
    const { id, name, group, requiresId } = req.body;
    const session = driver.session();

    try {
        let query = `CREATE (n:Skill {id: $id, name: $name, group: $group}) RETURN n`;
        
        if (requiresId && requiresId !== "none") {
            query = `
                CREATE (n:Skill {id: $id, name: $name, group: $group})
                WITH n
                MATCH (m:Skill {id: $requiresId})
                CREATE (n)-[:REQUIRES]->(m)
                RETURN n, m
            `;
        }

        await session.run(query, { id, name, group, requiresId });
        res.status(201).json({ message: 'Skill successfully added to Neo4j!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add skill' });
    } finally {
        await session.close();
    }
});

app.delete('/api/skills/:id', async (req, res) => {
    const skillId = req.params.id;
    const session = driver.session();

    try {
        await session.run(`MATCH (n:Skill {id: $id}) DETACH DELETE n`, { id: skillId });
        res.status(200).json({ message: 'Skill successfully deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete skill' });
    } finally {
        await session.close();
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));