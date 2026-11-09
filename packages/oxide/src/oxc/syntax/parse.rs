use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
#[cfg(test)]
use oxc_ast::ast::{Expression, ObjectExpression};
use oxc_parser::{ParseOptions, Parser};
use oxc_span::{SourceType, Span};

fn options() -> ParseOptions {
    ParseOptions {
        preserve_parens: true,
        ..ParseOptions::default()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Base(pub u32);

impl Base {
    pub fn offset(self, pos: u32) -> u32 {
        pos.saturating_sub(self.0)
    }

    pub fn start(self, span: Span) -> u32 {
        self.offset(span.start)
    }

    pub fn end(self, span: Span) -> u32 {
        self.offset(span.end)
    }

    pub fn range(self, span: Span) -> (u32, u32) {
        (self.start(span), self.end(span))
    }

    pub fn text<'s>(self, source: &'s str, span: Span) -> &'s str {
        let (start, end) = self.range(span);
        source.get(start as usize..end as usize).unwrap_or("")
    }
}

pub struct Parsed<'a> {
    pub program: Program<'a>,
    pub base: Base,
}

pub fn parse_program<'a>(allocator: &'a Allocator, source: &'a str) -> Result<Parsed<'a>, String> {
    let parsed = Parser::new(allocator, source, SourceType::tsx())
        .with_options(options())
        .parse();
    if let Some(error) = parsed.diagnostics.errors().next() {
        return Err(error.to_string());
    }
    Ok(Parsed {
        program: parsed.program,
        base: Base(0),
    })
}

#[cfg(test)]
pub fn parse_expression_text<'a>(allocator: &'a Allocator, text: &'a str) -> Option<Expression<'a>> {
    Parser::new(allocator, text, SourceType::tsx())
        .with_options(options())
        .parse_expression()
        .ok()
}

#[cfg(test)]
pub fn parse_object_text<'a>(allocator: &'a Allocator, text: &'a str) -> Option<oxc_allocator::Box<'a, ObjectExpression<'a>>> {
    let mut expr = parse_expression_text(allocator, text)?;
    loop {
        match expr {
            Expression::ObjectExpression(object) => return Some(object),
            Expression::ParenthesizedExpression(paren) => expr = paren.unbox().expression,
            _ => return None,
        }
    }
}
